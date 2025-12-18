import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { PhoneInput } from '@/components/ui/phone-input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useOptimizedSearch } from '@/hooks/useOptimizedSearch';
import { useLocation } from 'react-router-dom';
import { 
  Plus, 
  Minus, 
  Search, 
  ShoppingCart, 
  Calculator,
  Receipt,
  User,
  CreditCard,
  Loader2,
  Scan
} from 'lucide-react';
import { BarcodeScanner } from '@/components/BarcodeScanner';

interface ProductoVenta {
  id: string;
  sku: string;
  nombre: string;
  precio: number; // precio unitario (lista_x_12)
  valor_unitario: number; // valor unitario (variant_value_12 or precio/1.18)
  cantidad: number;
  descuento?: number;
  subtotal: number; // valor_unitario * cantidad
}

interface ProductoDisponible {
  sku: string;
  nombreProducto: string;
  variante: string | null;
  totalDisponibles: number;
}

export default function CrearVenta() {
  const location = useLocation();
  const { toast } = useToast();
  
  const [cliente, setCliente] = useState({
    nombre: '',
    email: '',
    telefono: '',
    ruc: '',
    company: '',
    activity: '',
    companyOrPerson: false, // 0 = Persona, 1 = Empresa
    firstName: '',
    lastName: ''
  });
  
  // Información de envío (separada del cliente)
  const [envio, setEnvio] = useState({
    direccion: '',
    ciudad: '',
    provincia: '',
    ubigeoDestino: '',
    ubigeoTexto: '',
    recipient: '' // Solo para empresas - persona que recibe la mercancía
  });

  // Estados para manejo de direcciones separadas en empresas
  const [mismasDirecciones, setMismasDirecciones] = useState(true);
  const [facturacion, setFacturacion] = useState({
    direccion: '',
    ciudad: '',
    provincia: '',
    ubigeoDestino: '',
    ubigeoTexto: ''
  });

  // Efecto para sincronizar direcciones cuando el switch cambia
  useEffect(() => {
    if (mismasDirecciones && cliente.companyOrPerson) {
      // Si el switch está activado, copiar datos de facturación a envío
      setEnvio(prev => ({
        ...prev,
        direccion: facturacion.direccion,
        ciudad: facturacion.ciudad, 
        provincia: facturacion.provincia,
        ubigeoDestino: facturacion.ubigeoDestino,
        ubigeoTexto: facturacion.ubigeoTexto
      }));
      setBusquedaUbigeo(facturacion.ubigeoTexto);
    } else if (!mismasDirecciones && cliente.companyOrPerson) {
      // Si el switch se desactiva, limpiar datos de envío
      setEnvio(prev => ({
        ...prev,
        direccion: '',
        ciudad: '',
        provincia: '',
        ubigeoDestino: '',
        ubigeoTexto: ''
      }));
      setBusquedaUbigeo('');
    }
  }, [mismasDirecciones, facturacion, cliente.companyOrPerson]);

  // Efecto para ajustar tipo de documento al cambiar tipo de cliente
  useEffect(() => {
    if (cliente.companyOrPerson) {
      // Cliente es empresa - cambiar a factura si está en boleta
      if (tipoDocumento === 'boleta') {
        setTipoDocumento('factura');
      }
      // Limpiar campos de persona natural
      setCliente(prev => ({
        ...prev,
        nombre: '',
        firstName: '',
        lastName: ''
      }));
    } else {
      // Cliente es persona natural - cambiar a boleta si está en factura
      if (tipoDocumento === 'factura') {
        setTipoDocumento('boleta');
      }
      // Limpiar campos de empresa
      setCliente(prev => ({
        ...prev,
        company: '',
        activity: '',
        ruc: ''
      }));
      setEnvio(prev => ({
        ...prev,
        recipient: ''
      }));
      // Resetear a mismas direcciones
      setMismasDirecciones(true);
      setFacturacion({
        direccion: '',
        ciudad: '',
        provincia: '',
        ubigeoDestino: '',
        ubigeoTexto: ''
      });
    }
    // Resetear guía de remisión al cambiar tipo de cliente
    setRequiereGuiaRemision(false);
  }, [cliente.companyOrPerson]);
  
  const [productos, setProductos] = useState<ProductoVenta[]>([]);
  const [isProductSearchDialogOpen, setIsProductSearchDialogOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState(false);
  const [lastScannedProduct, setLastScannedProduct] = useState<string | null>(null);
  const [importMode, setImportMode] = useState(false);
  const [excelData, setExcelData] = useState('');
  const [importedProducts, setImportedProducts] = useState<Array<{
    sku: string;
    cantidad: number;
    nombre?: string;
    precio?: number;
    valor_unitario?: number;
    stock?: number;
    error?: string;
  }>>([]);
  
  // Hook optimizado para búsqueda de productos
  const {
    searchQuery: busquedaProducto,
    setSearchQuery: setBusquedaProducto,
    results: productosDisponibles,
    isSearching: buscandoProductos,
    showSuggestions: mostrarSugerenciasProductos,
    setShowSuggestions: setMostrarSugerenciasProductos,
    hasMinChars: tieneCaracteresMinimos
  } = useOptimizedSearch({
    minChars: 3,
    includeStock: true,
    limit: 20
  });
  const [metodoPago, setMetodoPago] = useState('');
  const [numeroOperacion, setNumeroOperacion] = useState('');
  const [notas, setNotas] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<'factura' | 'boleta' | 'ticket'>('boleta');
  const [requiereGuiaRemision, setRequiereGuiaRemision] = useState(false);

  // Estados para ubigeos
  const [ubigeos, setUbigeos] = useState<any[]>([]);
  const [busquedaUbigeo, setBusquedaUbigeo] = useState('');
  const [mostrarUbigeos, setMostrarUbigeos] = useState(false);

  // Estados para ubigeos de facturación  
  const [ubigeosFacturacion, setUbigeosFacturacion] = useState<any[]>([]);
  const [busquedaUbigeoFacturacion, setBusquedaUbigeoFacturacion] = useState('');
  const [mostrarUbigeosFacturacion, setMostrarUbigeosFacturacion] = useState(false);

  // Estados para métodos de pago
  const [paymentTypes, setPaymentTypes] = useState<{ id: number; name: string }[]>([]);
  const [sellers, setSellers] = useState<{ id: number; firstName: string; lastName: string }[]>([]);
  const [selectedSeller, setSelectedSeller] = useState('');

  // Estados para búsqueda de vendedores
  const [busquedaVendedor, setBusquedaVendedor] = useState('');
  const [mostrarVendedores, setMostrarVendedores] = useState(false);
  const [vendedoresFiltrados, setVendedoresFiltrados] = useState<{ id: number; firstName: string; lastName: string }[]>([]);

  useEffect(() => {
    fetchPaymentTypes();
    fetchSellers();
    
    // Import products from contador if available
    const importedProducts = location.state?.importedProducts;
    if (importedProducts && Array.isArray(importedProducts) && importedProducts.length > 0) {
      const productosImportados: ProductoVenta[] = importedProducts.map((p: any) => ({
        id: p.sku,
        sku: p.sku,
        nombre: p.nombre,
        precio: p.precio,
        valor_unitario: p.valor_unitario,
        cantidad: p.cantidad,
        subtotal: p.valor_unitario * p.cantidad
      }));
      
      setProductos(productosImportados);
      
      toast({
        title: "Productos importados",
        description: `Se importaron ${productosImportados.length} productos desde el conteo`,
      });
      
      // Clear the state to prevent re-importing on component re-render
      window.history.replaceState({}, document.title);
    }
  }, [location.state, toast]);

  const buscarUbigeos = async (termino: string) => {
    const term = termino.trim();
    if (term.length < 2) {
      setUbigeos([]);
      return;
    }
    try {
      // Ejecutar búsqueda exacta por código y búsqueda amplia en paralelo
      const [exactRes, wideRes] = await Promise.all([
        supabase
          .from('ubigeos')
          .select('*')
          .eq('codigo', term)
          .limit(1),
        supabase
          .from('ubigeos')
          .select('*')
          .or(
            `distrito.ilike.%${term}%,provincia.ilike.%${term}%,departamento.ilike.%${term}%,nombre_completo.ilike.%${term}%,codigo.ilike.%${term}%`
          )
          .order('nombre_completo')
          .limit(50)
      ]);

      const exactData = exactRes.data || [];
      const wideData = wideRes.data || [];

      // Combinar resultados colocando el match exacto primero y evitando duplicados por código
      const seen = new Set<string>();
      const combinados = [...exactData, ...wideData].filter((u: any) => {
        if (seen.has(u.codigo)) return false;
        seen.add(u.codigo);
        return true;
      });

      setUbigeos(combinados);
    } catch (error) {
      console.error('Error buscando ubigeos:', error);
      setUbigeos([]);
    }
  };

  const fetchPaymentTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('payment_types' as any)
        .select('id, name')
        .order('name', { ascending: true });

      if (error) throw error;
      
      const paymentTypesData = (data as unknown as { id: number; name: string }[]) || [];
      
      console.log('All payment types from database:', paymentTypesData);
      
      // Filter out specific payment methods - check for various possible formats
      const hiddenMethods = [
        "ABONO DE CLIENTE", 
        "AMEX AMERICAN EXPRESS", 
        "CHEQUE", 
        "CREDITO", 
        "CREDITO A CUOTAS", 
        "DINNER CLUB", 
        "NOTA DE CREDITO DEVOLUCION",
        "NOTA CREDITO DEVOLUCION", // Added variant without "DE"
        "Nota de crédito devolución",
        "Nota crédito devolución", 
        "Página web"
      ];
      
      const filteredPaymentTypes = paymentTypesData.filter(payment => {
        const shouldHide = hiddenMethods.some(hiddenMethod => 
          payment.name.toLowerCase() === hiddenMethod.toLowerCase() ||
          payment.name.toLowerCase().includes('nota') && payment.name.toLowerCase().includes('credito') && payment.name.toLowerCase().includes('devolucion')
        );
        console.log(`Payment type "${payment.name}": ${shouldHide ? 'HIDDEN' : 'SHOWN'}`);
        return !shouldHide;
      });
      
      console.log('Filtered payment types:', filteredPaymentTypes);
      setPaymentTypes(filteredPaymentTypes);
      
      // Set default payment method to the first one if available
      if (filteredPaymentTypes.length > 0 && !metodoPago) {
        setMetodoPago(filteredPaymentTypes[0].name);
      }
    } catch (error) {
      console.error('Error fetching payment types:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los métodos de pago",
        variant: "destructive",
      });
    }
  };

  const fetchSellers = async () => {
    try {
      const { data, error } = await supabase
        .from('sellers')
        .select('id, firstName, lastName')
        .order('firstName', { ascending: true });

      if (error) throw error;

      setSellers(data || []);
      setVendedoresFiltrados(data || []);
      // No auto-seleccionar ningún vendedor - dejar que el usuario elija
    } catch (error) {
      console.error('Error fetching sellers:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los vendedores",
        variant: "destructive",
      });
    }
  };

  const filtrarUbigeos = () => {
    if (!busquedaUbigeo || busquedaUbigeo.length < 2) return [];
    
    const termino = busquedaUbigeo.toLowerCase().trim();
    
    // Búsqueda mejorada: priorizar coincidencias exactas y buscar en múltiples campos
    const resultados = ubigeos.filter(ubigeo => {
      const nombreCompleto = ubigeo.nombre_completo.toLowerCase();
      const codigo = ubigeo.codigo.toLowerCase();
      const distrito = ubigeo.distrito.toLowerCase();
      const provincia = ubigeo.provincia.toLowerCase();
      const departamento = ubigeo.departamento.toLowerCase();
      
      return (
        // Búsqueda por código exacto
        codigo.includes(termino) ||
        // Búsqueda en nombre completo
        nombreCompleto.includes(termino) ||
        // Búsqueda en distrito específico
        distrito.includes(termino) ||
        // Búsqueda en provincia
        provincia.includes(termino) ||
        // Búsqueda en departamento
        departamento.includes(termino)
      );
    });
    
    // Ordenar por relevancia: código exacto primero, luego nombre completo
    resultados.sort((a, b) => {
      const aCodigoMatch = a.codigo.toLowerCase() === termino;
      const bCodigoMatch = b.codigo.toLowerCase() === termino;
      
      if (aCodigoMatch && !bCodigoMatch) return -1;
      if (!aCodigoMatch && bCodigoMatch) return 1;
      
      // Si ambos tienen el código o ninguno, ordenar por nombre
      return a.nombre_completo.localeCompare(b.nombre_completo);
    });
    
    return resultados.slice(0, 20); // Aumentar límite a 20 resultados
  };

  const seleccionarUbigeo = (ubigeo: any) => {
    setEnvio({
      ...envio,
      ubigeoDestino: ubigeo.codigo,
      ubigeoTexto: ubigeo.nombre_completo
    });
    setBusquedaUbigeo(ubigeo.nombre_completo);
    setMostrarUbigeos(false);
  };

  const seleccionarUbigeoFacturacion = (ubigeo: any) => {
    setFacturacion({
      ...facturacion,
      ubigeoDestino: ubigeo.codigo,
      ubigeoTexto: ubigeo.nombre_completo
    });
    setBusquedaUbigeoFacturacion(ubigeo.nombre_completo);
    setMostrarUbigeosFacturacion(false);
  };

  const buscarUbigeosFacturacion = async (termino: string) => {
    const term = termino.trim();
    if (term.length < 2) {
      setUbigeosFacturacion([]);
      return;
    }
    try {
      // Ejecutar búsqueda exacta por código y búsqueda amplia en paralelo
      const [exactRes, wideRes] = await Promise.all([
        supabase
          .from('ubigeos')
          .select('*')
          .eq('codigo', term)
          .limit(1),
        supabase
          .from('ubigeos')
          .select('*')
          .or(
            `distrito.ilike.%${term}%,provincia.ilike.%${term}%,departamento.ilike.%${term}%,nombre_completo.ilike.%${term}%,codigo.ilike.%${term}%`
          )
          .order('nombre_completo')
          .limit(50)
      ]);

      const exactData = exactRes.data || [];
      const wideData = wideRes.data || [];

      // Combinar resultados colocando el match exacto primero y evitando duplicados por código
      const seen = new Set<string>();
      const combinados = [...exactData, ...wideData].filter((u: any) => {
        if (seen.has(u.codigo)) return false;
        seen.add(u.codigo);
        return true;
      });

      setUbigeosFacturacion(combinados);
    } catch (error) {
      console.error('Error buscando ubigeos de facturación:', error);
      setUbigeosFacturacion([]);
    }
  };

  // Función para buscar vendedores
  const buscarVendedores = (termino: string) => {
    const term = termino.trim().toLowerCase();
    if (term.length === 0) {
      setVendedoresFiltrados([]);
      return;
    }

    const resultados = sellers.filter(seller => {
      const nombreCompleto = `${seller.firstName} ${seller.lastName}`.toLowerCase();
      const firstName = seller.firstName.toLowerCase();
      const lastName = seller.lastName.toLowerCase();
      
      return (
        nombreCompleto.includes(term) ||
        firstName.includes(term) ||
        lastName.includes(term)
      );
    });

    setVendedoresFiltrados(resultados);
  };

  const seleccionarVendedor = (seller: { id: number; firstName: string; lastName: string }) => {
    setSelectedSeller(seller.id.toString());
    setBusquedaVendedor(`${seller.firstName} ${seller.lastName}`);
    setMostrarVendedores(false);
  };

  // Calcular totales
  const operacionGrabada = productos.reduce((sum, p) => sum + p.subtotal, 0); // Suma de valores
  const igv = parseFloat((operacionGrabada * 0.18).toFixed(2)); // IGV = operación grabada * 0.18
  const total = productos.reduce((sum, p) => sum + (p.precio * p.cantidad), 0); // Suma de totales de productos

  // Filtrar productos disponibles según búsqueda
  const productosFiltrados = productosDisponibles.filter(product => {
    const searchTerm = busquedaProducto.toLowerCase().trim();
    const productName = product.nombreProducto.toLowerCase();
    const sku = product.sku.toLowerCase();
    const variant = product.variante ? product.variante.toLowerCase() : '';
    
    return productName.includes(searchTerm) ||
           sku.includes(searchTerm) ||
           variant.includes(searchTerm);
  });

  const agregarProducto = async (productoDisponible: ProductoDisponible) => {
    try {
      // Check if the product is already in the list
      const existingProduct = productos.find(p => p.sku === productoDisponible.sku);
      
      if (existingProduct) {
        // If product exists, check if we can increment the quantity
        const newQuantity = existingProduct.cantidad + 1;
        
        // Get fresh stock data for validation
        const { data: stockData, error: stockError } = await supabase
          .from('stock_totals')
          .select('total_disponible')
          .eq('sku', productoDisponible.sku)
          .single();

        const stockDisponible = stockData?.total_disponible || 0;
        
        if (newQuantity > stockDisponible) {
          toast({
            title: "Stock insuficiente",
            description: `Solo hay ${stockDisponible} unidades disponibles de ${productoDisponible.nombreProducto}`,
            variant: "destructive",
          });
          return;
        }
        
        // Update existing product quantity
        const productosActualizados = productos.map(p => {
          if (p.sku === productoDisponible.sku) {
            return { ...p, cantidad: newQuantity, subtotal: p.valor_unitario * newQuantity };
          }
          return p;
        });
        setProductos(productosActualizados);
        setBusquedaProducto('');
        return;
      }

      // Check stock availability for new product
      if (productoDisponible.totalDisponibles < 1) {
        toast({
          title: "Sin stock",
          description: `No hay unidades disponibles de ${productoDisponible.nombreProducto}`,
          variant: "destructive",
        });
        return;
      }

      // Fetch pricing from variants table
      const { data: variantData, error } = await supabase
        .from('variants')
        .select('lista_x_12, variant_value_12')
        .eq('sku', productoDisponible.sku)
        .single();

      if (error) {
        console.error('Error fetching variant pricing:', error);
      }

      const precioUnitario = variantData?.lista_x_12 || 0;
      const valorUnitario = variantData?.variant_value_12 || (precioUnitario / 1.18);

      const nuevoProducto: ProductoVenta = {
        id: productoDisponible.sku,
        sku: productoDisponible.sku,
        nombre: productoDisponible.nombreProducto + (productoDisponible.variante ? ` - ${productoDisponible.variante}` : ''),
        precio: precioUnitario,
        valor_unitario: valorUnitario,
        cantidad: 1,
        descuento: 0,
        subtotal: valorUnitario * 1
      };
      setProductos([...productos, nuevoProducto]);
      setBusquedaProducto('');
    } catch (error) {
      console.error('Error adding product:', error);
      toast({
        title: "Error",
        description: "No se pudo agregar el producto",
        variant: "destructive",
      });
    }
  };

  const handleScan = async (code: string) => {
    try {
      // Search for product by SKU in variants table
      const { data: variantData, error: variantError } = await supabase
        .from('variants')
        .select('sku, variante, nombreProducto, lista_x_12, variant_value_12')
        .eq('sku', code)
        .single();

      if (variantError || !variantData) {
        toast({
          title: "Producto no encontrado",
          description: `No se encontró un producto con SKU: ${code}`,
          variant: "destructive",
        });
        return;
      }

      // Get stock information
      const { data: stockData } = await supabase
        .from('stock_totals')
        .select('total_disponible')
        .eq('sku', code)
        .single();

      const stockDisponible = stockData?.total_disponible || 0;

      if (stockDisponible < 1) {
        toast({
          title: "Sin stock",
          description: `No hay unidades disponibles de este producto`,
          variant: "destructive",
        });
        return;
      }

      // Create ProductoDisponible object
      const productoDisponible: ProductoDisponible = {
        sku: code,
        nombreProducto: variantData.nombreProducto,
        variante: variantData.variante,
        totalDisponibles: stockDisponible
      };

      // Add product
      await agregarProducto(productoDisponible);

      // Show success feedback
      setLastScannedProduct(variantData.nombreProducto);
      setTimeout(() => setLastScannedProduct(null), 2000);

      toast({
        title: "Producto agregado",
        description: `${variantData.nombreProducto} agregado a la venta`,
      });
    } catch (error) {
      console.error('Error processing scan:', error);
      toast({
        title: "Error",
        description: "No se pudo procesar el código escaneado",
        variant: "destructive",
      });
    }
  };

  const actualizarCantidadEnDialog = async (sku: string, nuevaCantidad: number) => {
    if (nuevaCantidad <= 0) {
      // Remover producto si la cantidad es 0
      setProductos(productos.filter(p => p.sku !== sku));
      return;
    }
    
    // Get fresh stock data for validation
    const { data: stockData, error: stockError } = await supabase
      .from('stock_totals')
      .select('total_disponible')
      .eq('sku', sku)
      .single();

    const stockDisponible = stockData?.total_disponible || 0;
    
    if (nuevaCantidad > stockDisponible) {
      toast({
        title: "Stock insuficiente",
        description: `Solo hay ${stockDisponible} unidades disponibles`,
        variant: "destructive",
      });
      return;
    }
    
    const productosActualizados = productos.map(p => {
      if (p.sku === sku) {
        // Subtotal = Valor Unitario × Cantidad
        return { ...p, cantidad: nuevaCantidad, subtotal: p.valor_unitario * nuevaCantidad };
      }
      return p;
    });
    setProductos(productosActualizados);
  };

  const getCantidadSeleccionada = (sku: string) => {
    const producto = productos.find(p => p.sku === sku);
    return producto ? producto.cantidad : 0;
  };

  // Helper function to determine if payment method requires operation number
  const requiresOperationNumber = (paymentMethod: string) => {
    const digitalMethods = [
      "Culqi", "CULQI",
      "Izipay", "IZIPAY", 
      "niubiz", "NIUBIZ",
      "yape", "YAPE", "Yape",
      "plin", "PLIN", "Plin",
      "transferencia", "TRANSFERENCIA", "Transferencia"
    ];
    return digitalMethods.some(method => 
      paymentMethod.toLowerCase().includes(method.toLowerCase())
    );
  };

  // Validación completa del formulario
  const esFormularioValido = () => {
    // Verificar que hay al menos un producto
    if (productos.length === 0) return false;
    
    // Verificar vendedor seleccionado
    if (!selectedSeller) return false;
    
    // Verificar método de pago
    if (!metodoPago) return false;
    
    // Verificar número de operación si es requerido
    if (requiresOperationNumber(metodoPago) && !numeroOperacion.trim()) return false;
    
    // Verificar información del cliente según tipo
    let clienteValido = false;
    if (cliente.companyOrPerson) {
      // Es empresa - verificar campos de empresa
      clienteValido = !!(
        cliente.company &&
        cliente.ruc &&
        cliente.email &&
        cliente.telefono
      );
    } else {
      // Es persona - verificar campos de persona
      clienteValido = !!(
        cliente.firstName &&
        cliente.email &&
        cliente.telefono
      );
    }
    
    if (!clienteValido) return false;
    
    // Verificar información de envío
    let envioValido = false;
    if (cliente.companyOrPerson && mismasDirecciones) {
      // Si es empresa y las direcciones son las mismas, validar facturación
      envioValido = !!(
        facturacion.direccion &&
        facturacion.ciudad &&
        facturacion.provincia &&
        facturacion.ubigeoDestino
      );
    } else {
      // Si no es empresa o las direcciones son diferentes, validar envío
      envioValido = !!(
        envio.direccion &&
        envio.ciudad &&
        envio.provincia &&
        envio.ubigeoDestino
      );
    }
    
    if (!envioValido) return false;

    // Para empresas con direcciones separadas, verificar información de facturación
    if (cliente.companyOrPerson && !mismasDirecciones) {
      const facturacionValida = !!(
        facturacion.direccion &&
        facturacion.ciudad &&
        facturacion.provincia &&
        facturacion.ubigeoDestino
      );
      if (!facturacionValida) return false;
    }
    
    return true;
  };

  const actualizarCantidad = async (index: number, nuevaCantidad: number) => {
    if (nuevaCantidad <= 0) return;
    
    const producto = productos[index];
    
    // Get fresh stock data for validation
    const { data: stockData, error: stockError } = await supabase
      .from('stock_totals')
      .select('total_disponible')
      .eq('sku', producto.sku)
      .single();

    const stockDisponible = stockData?.total_disponible || 0;
    
    if (nuevaCantidad > stockDisponible) {
      toast({
        title: "Stock insuficiente",
        description: `Solo hay ${stockDisponible} unidades disponibles de ${producto.nombre}`,
        variant: "destructive",
      });
      return;
    }
    
    const nuevosProductos = [...productos];
    nuevosProductos[index].cantidad = nuevaCantidad;
    // Subtotal = Valor Unitario × Cantidad
    nuevosProductos[index].subtotal = nuevosProductos[index].valor_unitario * nuevaCantidad;
    setProductos(nuevosProductos);
  };

  const actualizarPrecio = (index: number, nuevoPrecio: number) => {
    const nuevosProductos = [...productos];
    nuevosProductos[index].precio = nuevoPrecio;
    // Recalcular valor unitario: precio unitario / 1.18
    nuevosProductos[index].valor_unitario = nuevoPrecio / 1.18;
    // Subtotal = Valor Unitario × Cantidad
    nuevosProductos[index].subtotal = nuevosProductos[index].valor_unitario * nuevosProductos[index].cantidad;
    setProductos(nuevosProductos);
  };

  const eliminarProducto = (index: number) => {
    const nuevosProductos = productos.filter((_, i) => i !== index);
    setProductos(nuevosProductos);
  };

  const parseExcelData = async () => {
    if (!excelData.trim()) {
      toast({
        title: "Error",
        description: "Debe pegar datos desde Excel",
        variant: "destructive",
      });
      return;
    }

    try {
      // Parse Excel data (SKU and quantity)
      const lines = excelData.trim().split('\n');
      const parsedProducts: Array<{
        sku: string;
        cantidad: number;
        nombre?: string;
        precio?: number;
        valor_unitario?: number;
        stock?: number;
        error?: string;
      }> = [];

      for (const line of lines) {
        const [sku, cantidadStr] = line.split('\t').map(s => s.trim());
        
        if (!sku) continue;
        
        const cantidad = parseInt(cantidadStr) || 1;

        // Fetch variant data
        const { data: variantData, error: variantError } = await supabase
          .from('variants')
          .select('sku, nombreProducto, variante, lista_x_12, variant_value_12')
          .eq('sku', sku)
          .single();

        if (variantError || !variantData) {
          parsedProducts.push({
            sku,
            cantidad,
            error: 'Producto no encontrado'
          });
          continue;
        }

        // Get stock information
        const { data: stockData } = await supabase
          .from('stock_totals')
          .select('total_disponible')
          .eq('sku', sku)
          .single();

        const stockDisponible = stockData?.total_disponible || 0;
        const precioUnitario = variantData.lista_x_12 || 0;
        const valorUnitario = variantData.variant_value_12 || (precioUnitario / 1.18);

        parsedProducts.push({
          sku,
          cantidad,
          nombre: `${variantData.nombreProducto}${variantData.variante ? ` - ${variantData.variante}` : ''}`,
          precio: precioUnitario,
          valor_unitario: valorUnitario,
          stock: stockDisponible,
          error: stockDisponible < cantidad ? `Stock insuficiente (disponible: ${stockDisponible})` : undefined
        });
      }

      setImportedProducts(parsedProducts);
      
      toast({
        title: "Datos procesados",
        description: `Se procesaron ${parsedProducts.length} productos`,
      });
    } catch (error) {
      console.error('Error parsing Excel data:', error);
      toast({
        title: "Error",
        description: "No se pudieron procesar los datos de Excel",
        variant: "destructive",
      });
    }
  };

  const addImportedProductsToCart = () => {
    const validProducts = importedProducts.filter(p => !p.error && p.nombre && p.precio && p.valor_unitario);
    
    if (validProducts.length === 0) {
      toast({
        title: "Error",
        description: "No hay productos válidos para agregar",
        variant: "destructive",
      });
      return;
    }

    const newProducts: ProductoVenta[] = validProducts.map(p => ({
      id: p.sku,
      sku: p.sku,
      nombre: p.nombre!,
      precio: p.precio!,
      valor_unitario: p.valor_unitario!,
      cantidad: p.cantidad,
      descuento: 0,
      subtotal: p.valor_unitario! * p.cantidad
    }));

    setProductos([...productos, ...newProducts]);
    setImportedProducts([]);
    setExcelData('');
    setImportMode(false);
    
    toast({
      title: "Productos agregados",
      description: `Se agregaron ${validProducts.length} productos a la venta`,
    });
  };

  const finalizarVenta = async () => {
    if (productos.length === 0) {
      toast({
        title: "Error",
        description: "Debe agregar al menos un producto a la venta",
        variant: "destructive",
      });
      return;
    }

    // Validar datos del cliente según el tipo
    if (cliente.companyOrPerson) {
      // Es empresa - validar que tenga razón social
      if (!cliente.company) {
        toast({
          title: "Error", 
          description: "Debe ingresar la razón social de la empresa",
          variant: "destructive",
        });
        return;
      }
    } else {
      // Es persona natural - validar que tenga nombre o firstName
      if (!cliente.nombre && !cliente.firstName) {
        toast({
          title: "Error", 
          description: "Debe ingresar al menos el nombre del cliente",
          variant: "destructive",
        });
        return;
      }
    }

    // VERIFICACIÓN FINAL DE STOCK - verificar que todos los productos sigan disponibles
    try {
      const stockVerificationPromises = productos.map(async (producto) => {
        const { data: stockData, error: stockError } = await supabase
          .from('stock_totals')
          .select('total_disponible')
          .eq('sku', producto.sku)
          .single();

        const stockDisponible = stockData?.total_disponible || 0;
        
        return {
          sku: producto.sku,
          nombre: producto.nombre,
          cantidadSolicitada: producto.cantidad,
          stockDisponible: stockDisponible,
          disponible: stockDisponible >= producto.cantidad
        };
      });

      const verificaciones = await Promise.all(stockVerificationPromises);
      const productosNoDisponibles = verificaciones.filter(v => !v.disponible);

      if (productosNoDisponibles.length > 0) {
        const productosTexto = productosNoDisponibles
          .map(p => `${p.nombre}: solicitado ${p.cantidadSolicitada}, disponible ${p.stockDisponible}`)
          .join('\n');

        toast({
          title: "Stock insuficiente",
          description: `Los siguientes productos ya no tienen stock suficiente:\n${productosTexto}`,
          variant: "destructive",
        });
        return;
      }
    } catch (stockError) {
      console.error('Error verificando stock:', stockError);
      toast({
        title: "Error",
        description: "No se pudo verificar el stock disponible. Intente nuevamente.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Obtener el siguiente número de venta
      const { data: nextVentaId } = await supabase.rpc('get_next_sales_number');
      
      if (!nextVentaId) {
        throw new Error('No se pudo generar el número de venta');
      }

      // Preparar información del cliente
      const clienteInfo = {
        tipo: cliente.companyOrPerson,
        ruc: cliente.ruc,
        razonSocial: cliente.company,
        nombre: cliente.nombre,
        firstName: cliente.firstName,
        lastName: cliente.lastName,
        telefono: cliente.telefono,
        email: cliente.email
      };

      // Preparar información de envío
      const envioInfo = {
        direccion: envio.direccion,
        ciudad: envio.ciudad,
        provincia: envio.provincia,
        ubigeoDestino: envio.ubigeoDestino,
        ubigeoTexto: envio.ubigeoTexto,
        ...(cliente.companyOrPerson && { recipient: envio.recipient })
      };

      // Preparar información de facturación (solo para empresas con direcciones separadas)
      let facturacionInfo = null;
      if (cliente.companyOrPerson && !mismasDirecciones) {
        facturacionInfo = {
          direccion: facturacion.direccion,
          ciudad: facturacion.ciudad,
          provincia: facturacion.provincia,
          ubigeoDestino: facturacion.ubigeoDestino,
          ubigeoTexto: facturacion.ubigeoTexto,
          mismasDirecciones: false
        };
      } else if (cliente.companyOrPerson) {
        // Para empresas con mismas direcciones, usar la información de envío como facturación
        facturacionInfo = {
          direccion: envio.direccion,
          ciudad: envio.ciudad,
          provincia: envio.provincia,
          ubigeoDestino: envio.ubigeoDestino,
          ubigeoTexto: envio.ubigeoTexto,
          mismasDirecciones: true
        };
      }

      // Crear la venta principal
      const ventaData: any = {
        venta_id: nextVentaId,
        estado: 'pendiente',
        cliente_info: clienteInfo,
        envio_info: envioInfo,
        metodo_pago: metodoPago,
        numero_operacion: requiresOperationNumber(metodoPago) ? numeroOperacion : null,
        seller_id: selectedSeller ? parseInt(selectedSeller) : null,
        notas: notas,
        subtotal: operacionGrabada,
        igv: igv,
        total: total,
        documento_tipo: tipoDocumento,
        requiere_guia_remision: (tipoDocumento === 'boleta' || tipoDocumento === 'factura') ? requiereGuiaRemision : false
      };

      // Agregar información de facturación si existe (solo para empresas)
      if (facturacionInfo) {
        ventaData.facturacion_info = facturacionInfo;
      }

      const { data: venta, error: ventaError } = await supabase
        .from('ventas')
        .insert(ventaData)
        .select()
        .single();

      if (ventaError) {
        throw new Error(`Error al crear venta: ${ventaError.message}`);
      }

      // Crear los detalles de la venta
      const detalles = productos.map(producto => {
        // Buscar el producto en la lista de disponibles para obtener información completa
        const productoCompleto = productosDisponibles.find(p => p.sku === producto.sku);
        
        return {
          venta_id: venta.id,
          sku: producto.sku,
          nombre_producto: productoCompleto?.nombreProducto || producto.nombre,
          variante: productoCompleto?.variante || null,
          cantidad: producto.cantidad,
          precio_unitario: producto.precio,
          valor_unitario: producto.valor_unitario,
          subtotal_linea: producto.subtotal
        };
      });

      const { error: detallesError } = await supabase
        .from('ventas_detalle')
        .insert(detalles);

      if (detallesError) {
        throw new Error(`Error al crear detalles: ${detallesError.message}`);
      }

      // Asignar bins con sistema de 2 estados (reservado)
      console.log('🔵 Asignando bins (sistema 2 estados - reservado)...');
      const { data: assignResult, error: assignError } = await supabase.rpc('assign_bins_to_sale_v2', {
        sale_id: venta.id
      });

      if (assignError) {
        console.error('❌ Error al asignar bins:', assignError);
        throw new Error(`Error crítico al asignar stock: ${assignError.message}`);
      }

      // Verificar resultado de asignación (type cast for JSON response)
      const result = assignResult as any;
      if (!result || !result.success) {
        console.error('❌ Asignación fallida:', result);
        
        let errorMessage = 'No se pudo completar la asignación de stock.\n\n';
        
        if (result?.frozen_products && result.frozen_products.length > 0) {
          errorMessage += `⚠️ Productos congelados:\n${result.frozen_products.join('\n')}\n\n`;
        }
        
        if (result?.insufficient_stock && result.insufficient_stock.length > 0) {
          errorMessage += `❌ Stock insuficiente:\n${result.insufficient_stock.join('\n')}`;
        }
        
        throw new Error(errorMessage);
      }

      console.log(`✅ Asignación exitosa: ${result.total_assigned} unidades en ${result.skus_processed} SKUs`);

      // VALIDACIÓN FINAL: Verificar asignaciones en BD
      const { count: assignmentsCount, error: countError } = await supabase
        .from('ventas_asignaciones')
        .select('*', { count: 'exact', head: true })
        .eq('venta_id', venta.id);

      if (countError || !assignmentsCount || assignmentsCount === 0) {
        console.error('❌ CRÍTICO: Asignaciones no persistidas');
        throw new Error('Error crítico: asignaciones no se guardaron correctamente');
      }

      console.log(`✅ Validación final OK: ${assignmentsCount} asignaciones persistidas`);

      toast({
        title: "Venta registrada",
        description: `Venta ${venta.venta_id} por S/. ${total.toFixed(2)} registrada exitosamente`,
      });

      // Limpiar formulario
      setCliente({ 
        nombre: '', 
        email: '', 
        telefono: '', 
        ruc: '', 
        company: '',
        activity: '',
        companyOrPerson: false,
        firstName: '',
        lastName: ''
      });
      setEnvio({
        direccion: '',
        ciudad: '',
        provincia: '',
        ubigeoDestino: '',
        ubigeoTexto: '',
        recipient: ''
      });
      setFacturacion({
        direccion: '',
        ciudad: '',
        provincia: '',
        ubigeoDestino: '',
        ubigeoTexto: ''
      });
      setMismasDirecciones(true);
      setBusquedaUbigeo('');
      setBusquedaUbigeoFacturacion('');
      setProductos([]);
      setNotas('');
      setNumeroOperacion('');
      setMetodoPago('efectivo');
      setTipoDocumento('boleta');
      setRequiereGuiaRemision(false);
      
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo registrar la venta",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ShoppingCart className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Crear Venta</h1>
          <p className="text-muted-foreground">
            Registra una nueva venta en el sistema
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Información del Cliente */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User size={20} />
                Información del Cliente
              </CardTitle>
              <CardDescription>
                Datos del cliente para la venta
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyOrPerson">Tipo de Cliente</Label>
                <Select 
                  value={cliente.companyOrPerson ? "1" : "0"} 
                  onValueChange={(value) => setCliente({ ...cliente, companyOrPerson: value === "1" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Persona Natural</SelectItem>
                    <SelectItem value="1">Empresa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {cliente.companyOrPerson ? (
                // Campos para Empresa
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company">Razón Social *</Label>
                    <Input
                      id="company"
                      placeholder="Razón social de la empresa"
                      value={cliente.company}
                      onChange={(e) => setCliente({ ...cliente, company: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="activity">Giro del Cliente</Label>
                    <Input
                      id="activity"
                      placeholder="Giro o actividad comercial"
                      value={cliente.activity}
                      onChange={(e) => setCliente({ ...cliente, activity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ruc">RUC</Label>
                    <Input
                      id="ruc"
                      placeholder="12345678901"
                      value={cliente.ruc}
                      onChange={(e) => setCliente({ ...cliente, ruc: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                // Campos para Persona Natural
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Nombre *</Label>
                    <Input
                      id="firstName"
                      placeholder="Nombre de la persona"
                      value={cliente.firstName}
                      onChange={(e) => setCliente({ ...cliente, firstName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Apellido</Label>
                    <Input
                      id="lastName"
                      placeholder="Apellido de la persona"
                      value={cliente.lastName}
                      onChange={(e) => setCliente({ ...cliente, lastName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ruc">DNI</Label>
                    <Input
                      id="ruc"
                      placeholder="12345678"
                      value={cliente.ruc}
                      onChange={(e) => setCliente({ ...cliente, ruc: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="cliente@email.com"
                    value={cliente.email}
                    onChange={(e) => setCliente({ ...cliente, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefono">Teléfono</Label>
                  <PhoneInput
                    value={cliente.telefono}
                    onChange={(value) => setCliente({ ...cliente, telefono: value })}
                    placeholder="999 999 999"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Información de Facturación - Primero para empresas */}
          {cliente.companyOrPerson && (
            <Card>
              <CardHeader>
                <CardTitle>Información de Facturación</CardTitle>
                <CardDescription>
                  Datos de la dirección fiscal de la empresa
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ciudadFacturacion">Ciudad</Label>
                    <Input
                      id="ciudadFacturacion"
                      placeholder="Ciudad de facturación"
                      value={facturacion.ciudad}
                      onChange={(e) => setFacturacion({ ...facturacion, ciudad: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provinciaFacturacion">Provincia</Label>
                    <Input
                      id="provinciaFacturacion"
                      placeholder="Provincia de facturación"
                      value={facturacion.provincia}
                      onChange={(e) => setFacturacion({ ...facturacion, provincia: e.target.value })}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="direccionFacturacion">Dirección Fiscal</Label>
                  <Input
                    id="direccionFacturacion"
                    placeholder="Dirección completa de facturación"
                    value={facturacion.direccion}
                    onChange={(e) => setFacturacion({ ...facturacion, direccion: e.target.value })}
                  />
                </div>

                {/* Campo Persona Consignada solo para empresas */}
                <div className="space-y-2">
                  <Label htmlFor="recipient">Persona Consignada *</Label>
                  <Input
                    id="recipient"
                    placeholder="Nombre de la persona que recibirá la mercancía"
                    value={envio.recipient}
                    onChange={(e) => setEnvio({ ...envio, recipient: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Requerido para generar la guía de remisión
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ubigeoFacturacion">Ubigeo Facturación</Label>
                  <div className="relative">
                    <Input
                      id="ubigeoFacturacion"
                      placeholder="Buscar por código (ej: 150140), distrito, provincia..."
                      value={busquedaUbigeoFacturacion}
                      onChange={(e) => {
                        const value = e.target.value;
                        setBusquedaUbigeoFacturacion(value);
                        const shouldShow = value.length > 1;
                        setMostrarUbigeosFacturacion(shouldShow);
                        if (shouldShow) {
                          buscarUbigeosFacturacion(value);
                        } else {
                          setUbigeosFacturacion([]);
                        }
                      }}
                      onFocus={() => {
                        if (busquedaUbigeoFacturacion.length > 1) {
                          setMostrarUbigeosFacturacion(true);
                          buscarUbigeosFacturacion(busquedaUbigeoFacturacion);
                        }
                      }}
                    />
                    {mostrarUbigeosFacturacion && (
                      <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {ubigeosFacturacion.map((ubigeo) => (
                          <div
                            key={`fact-${ubigeo.codigo}`}
                            className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground border-b border-border/20 last:border-b-0"
                            onClick={() => seleccionarUbigeoFacturacion(ubigeo)}
                          >
                            <div className="font-medium">{ubigeo.distrito}</div>
                            <div className="text-xs text-muted-foreground">
                              {ubigeo.provincia}, {ubigeo.departamento} ({ubigeo.codigo})
                            </div>
                          </div>
                        ))}
                        {ubigeosFacturacion.length === 0 && busquedaUbigeoFacturacion.length > 1 && (
                          <div className="px-3 py-2 text-muted-foreground">
                            No se encontraron resultados para "{busquedaUbigeoFacturacion}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {facturacion.ubigeoTexto && (
                    <p className="text-sm text-muted-foreground">
                      Seleccionado: {facturacion.ubigeoTexto}
                    </p>
                  )}
                </div>

                {/* Switch para direcciones separadas */}
                <div className="flex items-center space-x-2 p-4 bg-muted/50 rounded-lg">
                  <Switch
                    id="mismas-direcciones"
                    checked={mismasDirecciones}
                    onCheckedChange={setMismasDirecciones}
                  />
                  <Label htmlFor="mismas-direcciones" className="text-sm font-medium">
                    La dirección de envío es la misma que la dirección de facturación
                  </Label>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Información de Envío - Solo se muestra cuando no son las mismas direcciones o es persona natural */}
          {(!cliente.companyOrPerson || !mismasDirecciones) && (
            <Card>
              <CardHeader>
                <CardTitle>Información de Envío</CardTitle>
                <CardDescription>
                  {cliente.companyOrPerson 
                    ? "Datos del destino para la entrega"
                    : "Datos del destino para la entrega"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ciudadEnvio">Ciudad</Label>
                  <Input
                    id="ciudadEnvio"
                    placeholder="Ciudad de entrega"
                    value={envio.ciudad}
                    onChange={(e) => setEnvio({ ...envio, ciudad: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provinciaEnvio">Provincia</Label>
                  <Input
                    id="provinciaEnvio"
                    placeholder="Provincia de entrega"
                    value={envio.provincia}
                    onChange={(e) => setEnvio({ ...envio, provincia: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="direccionEnvio">Dirección de Entrega</Label>
                <Input
                  id="direccionEnvio"
                  placeholder="Dirección completa de entrega"
                  value={envio.direccion}
                  onChange={(e) => setEnvio({ ...envio, direccion: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ubigeoDestino">Ubigeo Destino</Label>
                <div className="relative">
                  <Input
                    id="ubigeoDestino"
                    placeholder="Buscar por código (ej: 150140), distrito, provincia..."
                    value={busquedaUbigeo}
                    onChange={(e) => {
                      const value = e.target.value;
                      setBusquedaUbigeo(value);
                      const shouldShow = value.length > 1;
                      setMostrarUbigeos(shouldShow);
                      if (shouldShow) {
                        buscarUbigeos(value);
                      } else {
                        setUbigeos([]);
                      }
                    }}
                    onFocus={() => {
                      if (busquedaUbigeo.length > 1) {
                        setMostrarUbigeos(true);
                        buscarUbigeos(busquedaUbigeo);
                      }
                    }}
                  />
                  {mostrarUbigeos && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filtrarUbigeos().map((ubigeo) => (
                        <div
                          key={ubigeo.codigo}
                          className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground border-b border-border/20 last:border-b-0"
                          onClick={() => seleccionarUbigeo(ubigeo)}
                        >
                          <div className="font-medium">{ubigeo.distrito}</div>
                          <div className="text-xs text-muted-foreground">
                            {ubigeo.provincia}, {ubigeo.departamento} ({ubigeo.codigo})
                          </div>
                        </div>
                      ))}
                      {filtrarUbigeos().length === 0 && busquedaUbigeo.length > 1 && (
                        <div className="px-3 py-2 text-muted-foreground">
                          No se encontraron resultados para "{busquedaUbigeo}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {envio.ubigeoTexto && (
                  <p className="text-sm text-muted-foreground">
                    Seleccionado: {envio.ubigeoTexto}
                  </p>
                )}
              </div>
             </CardContent>
           </Card>
          )}

           {/* Productos */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="flex items-center gap-2">
                      <Receipt size={20} />
                      Productos de la Venta
                    </CardTitle>
                    <Badge variant="secondary">
                      {productosDisponibles.length} disponibles
                    </Badge>
                  </div>
                  <Dialog open={isProductSearchDialogOpen} onOpenChange={setIsProductSearchDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="flex items-center gap-2" disabled={scannerMode || importMode}>
                        <Plus size={16} />
                        Agregar Producto
                      </Button>
                    </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
                    <DialogHeader>
                      <DialogTitle>Buscar Productos</DialogTitle>
                      <DialogDescription>
                        Busca y selecciona productos para agregar a la venta
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Input
                        placeholder="Buscar por nombre, SKU o variante..."
                        value={busquedaProducto}
                        onChange={(e) => setBusquedaProducto(e.target.value)}
                      />
                      <div className="max-h-96 overflow-y-auto space-y-2">
                        {productosFiltrados.length > 0 ? (
                          productosFiltrados.map(product => {
                            const cantidadSeleccionada = getCantidadSeleccionada(product.sku);
                            return (
                              <div key={product.sku} className="flex items-center justify-between p-3 border rounded-lg">
                                <div className="flex-1">
                                  <h3 className="font-medium">{product.nombreProducto}</h3>
                                  {product.variante && (
                                    <p className="text-sm text-muted-foreground">{product.variante}</p>
                                  )}
                                  <div className="flex items-center gap-4 mt-1">
                                    <Badge variant="outline">{product.sku}</Badge>
                                    <span className="text-sm text-muted-foreground">
                                      Disponible: {product.totalDisponibles}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {cantidadSeleccionada > 0 ? (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => actualizarCantidadEnDialog(product.sku, cantidadSeleccionada - 1)}
                                      >
                                        <Minus className="h-4 w-4" />
                                      </Button>
                                      <Input
                                        type="number"
                                        value={cantidadSeleccionada}
                                        onChange={(e) => actualizarCantidadEnDialog(product.sku, parseInt(e.target.value) || 0)}
                                        className="w-16 text-center"
                                        min="0"
                                        max={product.totalDisponibles}
                                      />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => actualizarCantidadEnDialog(product.sku, cantidadSeleccionada + 1)}
                                        disabled={cantidadSeleccionada >= product.totalDisponibles}
                                      >
                                        <Plus className="h-4 w-4" />
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => agregarProducto(product)}
                                    >
                                      <Plus className="h-4 w-4 mr-2" />
                                      Agregar
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            {busquedaProducto ? 'No se encontraron productos que coincidan con la búsqueda' : 'Escribe para buscar productos'}
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md bg-background">
                    <Scan size={16} className="text-muted-foreground" />
                    <span className="text-sm font-medium">Scanner</span>
                    <Switch
                      checked={scannerMode}
                      onCheckedChange={(checked) => {
                        setScannerMode(checked);
                        if (checked) setImportMode(false);
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md bg-background">
                    <Receipt size={16} className="text-muted-foreground" />
                    <span className="text-sm font-medium">Importar</span>
                    <Switch
                      checked={importMode}
                      onCheckedChange={(checked) => {
                        setImportMode(checked);
                        if (checked) setScannerMode(false);
                      }}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {scannerMode && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Escanear Productos</Label>
                    {lastScannedProduct && (
                      <Badge variant="default" className="animate-in fade-in">
                        ✓ {lastScannedProduct}
                      </Badge>
                    )}
                  </div>
                  <BarcodeScanner
                    onScan={handleScan}
                    placeholder="Escanee el código de barras del producto..."
                  />
                  <p className="text-sm text-muted-foreground">
                    Escanee el código de barras o ingrese el SKU manualmente y presione Enter
                  </p>
                </div>
              )}

              {importMode && (
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Importar desde Excel</Label>
                  <div className="space-y-2">
                    <textarea
                      className="w-full min-h-[120px] p-3 border rounded-md bg-background resize-y"
                      placeholder="Pegue los datos desde Excel (SKU y Cantidad en columnas separadas por tabulación)&#10;Ejemplo:&#10;SKU001    5&#10;SKU002    3&#10;SKU003    10"
                      value={excelData}
                      onChange={(e) => setExcelData(e.target.value)}
                    />
                    <Button onClick={parseExcelData} className="w-full">
                      Procesar Datos
                    </Button>
                  </div>

                  {importedProducts.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Productos Procesados</Label>
                        <Badge variant="secondary">
                          {importedProducts.filter(p => !p.error).length} válidos
                        </Badge>
                      </div>
                      <div className="rounded-md border max-h-[400px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>SKU</TableHead>
                              <TableHead>Producto</TableHead>
                              <TableHead>Cantidad</TableHead>
                              <TableHead>Precio Unit.</TableHead>
                              <TableHead>Stock</TableHead>
                              <TableHead>Estado</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {importedProducts.map((product, index) => (
                              <TableRow key={index} className={product.error ? 'bg-destructive/10' : ''}>
                                <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                                <TableCell>{product.nombre || '-'}</TableCell>
                                <TableCell>{product.cantidad}</TableCell>
                                <TableCell>
                                  {product.precio ? `S/. ${product.precio.toFixed(2)}` : '-'}
                                </TableCell>
                                <TableCell>{product.stock ?? '-'}</TableCell>
                                <TableCell>
                                  {product.error ? (
                                    <Badge variant="destructive">{product.error}</Badge>
                                  ) : (
                                    <Badge variant="default">✓ Válido</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <Button 
                        onClick={addImportedProductsToCart} 
                        className="w-full"
                        disabled={importedProducts.filter(p => !p.error).length === 0}
                      >
                        Agregar {importedProducts.filter(p => !p.error).length} productos a la venta
                      </Button>
                    </div>
                  )}
                </div>
              )}
              
              {productos.length > 0 ? (
                <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead className="w-24">Cantidad</TableHead>
                          <TableHead className="w-24">Precio Unitario</TableHead>
                          <TableHead className="w-24">Valor</TableHead>
                          <TableHead className="w-24">Total</TableHead>
                          <TableHead className="w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productos.map((producto, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{producto.nombre}</div>
                                <div className="text-sm text-muted-foreground">{producto.sku}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => actualizarCantidad(index, producto.cantidad - 1)}
                                >
                                  <Minus size={12} />
                                </Button>
                                <span className="w-8 text-center">{producto.cantidad}</span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => actualizarCantidad(index, producto.cantidad + 1)}
                                >
                                  <Plus size={12} />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={producto.precio}
                                onChange={(e) => actualizarPrecio(index, parseFloat(e.target.value) || 0)}
                                className="w-20"
                                step="0.01"
                                min="0"
                              />
                            </TableCell>
                            <TableCell>S/. {producto.valor_unitario.toFixed(2)}</TableCell>
                            <TableCell>S/. {(producto.precio * producto.cantidad).toFixed(2)}</TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => eliminarProducto(index)}
                              >
                                <Minus size={12} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No hay productos agregados a la venta
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Resumen de Venta */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator size={20} />
                Resumen de Venta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Operación grabada:</span>
                  <span>S/. {operacionGrabada.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IGV (18%):</span>
                  <span>S/. {igv.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total:</span>
                  <span>S/. {total.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="seller" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Vendedor
                </Label>
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="seller"
                      placeholder={sellers.length === 0 ? "No hay vendedores disponibles" : "Elegir Vendedor"}
                      value={busquedaVendedor}
                      onChange={(e) => {
                        const value = e.target.value;
                        setBusquedaVendedor(value);
                        const shouldShow = value.length > 0;
                        setMostrarVendedores(shouldShow);
                        if (shouldShow) {
                          buscarVendedores(value);
                        } else {
                          setVendedoresFiltrados([]);
                        }
                      }}
                      onFocus={() => {
                        if (sellers.length > 0) {
                          setMostrarVendedores(true);
                          if (busquedaVendedor.length > 0) {
                            buscarVendedores(busquedaVendedor);
                          } else {
                            setVendedoresFiltrados(sellers);
                          }
                        }
                      }}
                      className="pl-10"
                      disabled={sellers.length === 0}
                    />
                  </div>
                  {mostrarVendedores && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {vendedoresFiltrados.length > 0 ? (
                        vendedoresFiltrados.map((seller) => (
                          <div
                            key={seller.id}
                            className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground border-b border-border/20 last:border-b-0"
                            onClick={() => seleccionarVendedor(seller)}
                          >
                            <div className="font-medium">{seller.firstName} {seller.lastName}</div>
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-muted-foreground">
                          {sellers.length === 0 ? "No hay vendedores disponibles" : "No se encontraron vendedores"}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {selectedSeller && (
                  <p className="text-sm text-muted-foreground">
                    Seleccionado: {busquedaVendedor}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="metodoPago">Método de Pago</Label>
                <Select value={metodoPago} onValueChange={setMetodoPago} disabled={paymentTypes.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={paymentTypes.length === 0 ? "Cargando métodos..." : "Selecciona método de pago"} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border z-50 max-h-60 overflow-y-auto">
                    {paymentTypes.length === 0 ? (
                      <SelectItem value="no-options" disabled>
                        No hay métodos disponibles
                      </SelectItem>
                    ) : (
                      paymentTypes.map((paymentType) => (
                        <SelectItem key={paymentType.id} value={paymentType.name}>
                          {paymentType.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {requiresOperationNumber(metodoPago) && (
                <div className="space-y-2">
                  <Label htmlFor="numeroOperacion">Número de Operación *</Label>
                  <Input
                    id="numeroOperacion"
                    placeholder="Ingresa el número de operación"
                    value={numeroOperacion}
                    onChange={(e) => setNumeroOperacion(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Requerido para métodos de pago digitales
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="tipoDocumento">Tipo de Documento *</Label>
                <Select value={tipoDocumento} onValueChange={(value: any) => {
                  setTipoDocumento(value);
                  // Si elige ticket, resetear guía de remisión
                  if (value === 'ticket') {
                    setRequiereGuiaRemision(false);
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border z-50">
                    {!cliente.companyOrPerson && (
                      <SelectItem value="boleta">Boleta</SelectItem>
                    )}
                    {cliente.companyOrPerson && (
                      <SelectItem value="factura">Factura</SelectItem>
                    )}
                    <SelectItem value="ticket">Ticket</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {!cliente.companyOrPerson 
                    ? 'Boleta o Ticket para persona natural' 
                    : 'Factura o Ticket para empresa'}
                </p>
              </div>

              {(tipoDocumento === 'boleta' || tipoDocumento === 'factura') && (
                <div className="flex items-center justify-between space-x-2">
                  <div className="space-y-0.5">
                    <Label htmlFor="guiaRemision">¿Requiere Guía de Remisión?</Label>
                    <p className="text-sm text-muted-foreground">
                      Se notificará al preparador del pedido
                    </p>
                  </div>
                  <Switch
                    id="guiaRemision"
                    checked={requiereGuiaRemision}
                    onCheckedChange={setRequiereGuiaRemision}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notas">Notas</Label>
                <Input
                  id="notas"
                  placeholder="Notas adicionales..."
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                />
              </div>

              <Button 
                onClick={finalizarVenta}
                className="w-full"
                size="lg"
                disabled={!esFormularioValido()}
              >
                <CreditCard size={20} className="mr-2" />
                Finalizar Venta
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}