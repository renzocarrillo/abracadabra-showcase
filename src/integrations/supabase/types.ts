export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      bin_inventories: {
        Row: {
          bin_code: string
          created_at: string
          finished_at: string | null
          finished_by: string | null
          finished_by_name: string | null
          id: string
          notes: string | null
          report_url: string | null
          started_at: string
          started_by: string
          started_by_name: string
          status: Database["public"]["Enums"]["inventory_status"]
          updated_at: string
        }
        Insert: {
          bin_code: string
          created_at?: string
          finished_at?: string | null
          finished_by?: string | null
          finished_by_name?: string | null
          id?: string
          notes?: string | null
          report_url?: string | null
          started_at?: string
          started_by: string
          started_by_name: string
          status?: Database["public"]["Enums"]["inventory_status"]
          updated_at?: string
        }
        Update: {
          bin_code?: string
          created_at?: string
          finished_at?: string | null
          finished_by?: string | null
          finished_by_name?: string | null
          id?: string
          notes?: string | null
          report_url?: string | null
          started_at?: string
          started_by?: string
          started_by_name?: string
          status?: Database["public"]["Enums"]["inventory_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bin_inventories_bin_code_fkey"
            columns: ["bin_code"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["bin_code"]
          },
          {
            foreignKeyName: "bin_inventories_finished_by_fkey"
            columns: ["finished_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bin_inventories_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bins: {
        Row: {
          bin_code: string
          created_at: string
          created_by: string | null
          frozen_at: string | null
          frozen_by: string | null
          frozen_reason: string | null
          id: string
          is_frozen: boolean | null
          updated_at: string
        }
        Insert: {
          bin_code: string
          created_at?: string
          created_by?: string | null
          frozen_at?: string | null
          frozen_by?: string | null
          frozen_reason?: string | null
          id?: string
          is_frozen?: boolean | null
          updated_at?: string
        }
        Update: {
          bin_code?: string
          created_at?: string
          created_by?: string | null
          frozen_at?: string | null
          frozen_by?: string | null
          frozen_reason?: string | null
          id?: string
          is_frozen?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bins_frozen_by_fkey"
            columns: ["frozen_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conteo_productos: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: string
          nombre: string | null
          notas: string | null
          total_productos: number
          total_unidades: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          nombre?: string | null
          notas?: string | null
          total_productos?: number
          total_unidades?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          nombre?: string | null
          notas?: string | null
          total_productos?: number
          total_unidades?: number
        }
        Relationships: []
      }
      conteo_productos_detalle: {
        Row: {
          cantidad: number
          conteo_id: string
          created_at: string
          id: string
          sku: string
        }
        Insert: {
          cantidad: number
          conteo_id: string
          created_at?: string
          id?: string
          sku: string
        }
        Update: {
          cantidad?: number
          conteo_id?: string
          created_at?: string
          id?: string
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "conteo_productos_detalle_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "conteo_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_composition_snapshots: {
        Row: {
          created_at: string
          id: string
          product_type: string
          snapshot_date: string
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_type: string
          snapshot_date: string
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_type?: string
          snapshot_date?: string
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_stock_snapshots: {
        Row: {
          created_at: string
          id: string
          snapshot_date: string
          total_stock: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          snapshot_date: string
          total_stock?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          snapshot_date?: string
          total_stock?: number
          updated_at?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          config: Json | null
          created_at: string
          created_by: string | null
          description: string | null
          flag_key: string
          flag_name: string
          id: string
          is_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          flag_key: string
          flag_name: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          flag_key?: string
          flag_name?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      historical_stock_corrections: {
        Row: {
          bin_corregido: string
          cantidad_corregida: number
          corrected_at: string | null
          corrected_by: string | null
          disponibles_antes: number
          disponibles_despues: number
          fecha_venta: string | null
          id: string
          notes: string | null
          sku: string
          stock_id: string
          tipo_documento: string | null
          venta_codigo: string
          venta_id: string
        }
        Insert: {
          bin_corregido: string
          cantidad_corregida: number
          corrected_at?: string | null
          corrected_by?: string | null
          disponibles_antes: number
          disponibles_despues: number
          fecha_venta?: string | null
          id?: string
          notes?: string | null
          sku: string
          stock_id: string
          tipo_documento?: string | null
          venta_codigo: string
          venta_id: string
        }
        Update: {
          bin_corregido?: string
          cantidad_corregida?: number
          corrected_at?: string | null
          corrected_by?: string | null
          disponibles_antes?: number
          disponibles_despues?: number
          fecha_venta?: string | null
          id?: string
          notes?: string | null
          sku?: string
          stock_id?: string
          tipo_documento?: string | null
          venta_codigo?: string
          venta_id?: string
        }
        Relationships: []
      }
      inventory_age_snapshots_org: {
        Row: {
          age_range: string
          created_at: string
          id: string
          snapshot_date: string
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          age_range: string
          created_at?: string
          id?: string
          snapshot_date: string
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          age_range?: string
          created_at?: string
          id?: string
          snapshot_date?: string
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_age_snapshots_store: {
        Row: {
          age_range: string
          created_at: string
          id: string
          snapshot_date: string
          stock_quantity: number
          store_name: string
          updated_at: string
        }
        Insert: {
          age_range: string
          created_at?: string
          id?: string
          snapshot_date: string
          stock_quantity?: number
          store_name: string
          updated_at?: string
        }
        Update: {
          age_range?: string
          created_at?: string
          id?: string
          snapshot_date?: string
          stock_quantity?: number
          store_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_changes: {
        Row: {
          change_type: string
          created_at: string
          difference: number
          id: string
          inventory_id: string
          new_quantity: number
          nombre_producto: string
          previous_quantity: number
          sku: string
          stock_id: string
          variante: string | null
        }
        Insert: {
          change_type: string
          created_at?: string
          difference: number
          id?: string
          inventory_id: string
          new_quantity: number
          nombre_producto: string
          previous_quantity: number
          sku: string
          stock_id: string
          variante?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string
          difference?: number
          id?: string
          inventory_id?: string
          new_quantity?: number
          nombre_producto?: string
          previous_quantity?: number
          sku?: string
          stock_id?: string
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_changes_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "bin_inventories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_changes_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stockxbin"
            referencedColumns: ["id"]
          },
        ]
      }
      margin_inventory_age_snapshots: {
        Row: {
          categoria: string
          created_at: string | null
          edad_promedio_dias: number
          id: string
          margen_pct: number
          num_productos: number
          snapshot_date: string
          sucursal: string
          updated_at: string | null
          ventas_totales: number
        }
        Insert: {
          categoria: string
          created_at?: string | null
          edad_promedio_dias?: number
          id?: string
          margen_pct?: number
          num_productos?: number
          snapshot_date?: string
          sucursal: string
          updated_at?: string | null
          ventas_totales?: number
        }
        Update: {
          categoria?: string
          created_at?: string | null
          edad_promedio_dias?: number
          id?: string
          margen_pct?: number
          num_productos?: number
          snapshot_date?: string
          sucursal?: string
          updated_at?: string | null
          ventas_totales?: number
        }
        Relationships: []
      }
      order_signatures: {
        Row: {
          created_at: string
          id: string
          order_code: string
          order_id: string
          order_type: string
          review_notes: string | null
          signature_hash: string
          signed_at: string
          signed_by: string
          signed_by_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_code: string
          order_id: string
          order_type: string
          review_notes?: string | null
          signature_hash: string
          signed_at?: string
          signed_by: string
          signed_by_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          order_code?: string
          order_id?: string
          order_type?: string
          review_notes?: string | null
          signature_hash?: string
          signed_at?: string
          signed_by?: string
          signed_by_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_types: {
        Row: {
          id: number
          name: string | null
        }
        Insert: {
          id?: number
          name?: string | null
        }
        Update: {
          id?: number
          name?: string | null
        }
        Relationships: []
      }
      pedidos: {
        Row: {
          created_at: string
          details_href: string | null
          eliminado_por_usuario_id: string | null
          eliminado_por_usuario_nombre: string | null
          estado: string
          fecha_eliminacion: string | null
          id: string
          id_bsale_documento: number | null
          motivo_eliminacion: string | null
          pedido_id: string
          productos_retirados_por: string | null
          serial_number: string | null
          tienda_id: string | null
          tienda_nombre: string | null
          tipo: string
          total_items: number
          updated_at: string
          url_public_view: string | null
        }
        Insert: {
          created_at?: string
          details_href?: string | null
          eliminado_por_usuario_id?: string | null
          eliminado_por_usuario_nombre?: string | null
          estado?: string
          fecha_eliminacion?: string | null
          id?: string
          id_bsale_documento?: number | null
          motivo_eliminacion?: string | null
          pedido_id: string
          productos_retirados_por?: string | null
          serial_number?: string | null
          tienda_id?: string | null
          tienda_nombre?: string | null
          tipo?: string
          total_items?: number
          updated_at?: string
          url_public_view?: string | null
        }
        Update: {
          created_at?: string
          details_href?: string | null
          eliminado_por_usuario_id?: string | null
          eliminado_por_usuario_nombre?: string | null
          estado?: string
          fecha_eliminacion?: string | null
          id?: string
          id_bsale_documento?: number | null
          motivo_eliminacion?: string | null
          pedido_id?: string
          productos_retirados_por?: string | null
          serial_number?: string | null
          tienda_id?: string | null
          tienda_nombre?: string | null
          tipo?: string
          total_items?: number
          updated_at?: string
          url_public_view?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_asignaciones: {
        Row: {
          bin: string
          cantidad_asignada: number
          created_at: string
          id: string
          pedido_detalle_id: string
          pedido_id: string
          sku: string
          stock_id: string
        }
        Insert: {
          bin: string
          cantidad_asignada: number
          created_at?: string
          id?: string
          pedido_detalle_id: string
          pedido_id: string
          sku: string
          stock_id: string
        }
        Update: {
          bin?: string
          cantidad_asignada?: number
          created_at?: string
          id?: string
          pedido_detalle_id?: string
          pedido_id?: string
          sku?: string
          stock_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_asignaciones_pedido_detalle_id_fkey"
            columns: ["pedido_detalle_id"]
            isOneToOne: false
            referencedRelation: "pedidos_detalle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_asignaciones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_asignaciones_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "pedidos_asignaciones_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stockxbin"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_audit_log: {
        Row: {
          accion: string
          created_at: string
          detalles: Json | null
          estado_anterior: string | null
          estado_nuevo: string | null
          id: string
          pedido_codigo: string
          pedido_id: string
          usuario_id: string | null
          usuario_nombre: string | null
        }
        Insert: {
          accion: string
          created_at?: string
          detalles?: Json | null
          estado_anterior?: string | null
          estado_nuevo?: string | null
          id?: string
          pedido_codigo: string
          pedido_id: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Update: {
          accion?: string
          created_at?: string
          detalles?: Json | null
          estado_anterior?: string | null
          estado_nuevo?: string | null
          id?: string
          pedido_codigo?: string
          pedido_id?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Relationships: []
      }
      pedidos_detalle: {
        Row: {
          cantidad_asignada: number
          cantidad_solicitada: number
          created_at: string
          id: string
          nombre_producto: string
          pedido_id: string
          sku: string
          updated_at: string
          variante: string | null
        }
        Insert: {
          cantidad_asignada?: number
          cantidad_solicitada: number
          created_at?: string
          id?: string
          nombre_producto: string
          pedido_id: string
          sku: string
          updated_at?: string
          variante?: string | null
        }
        Update: {
          cantidad_asignada?: number
          cantidad_solicitada?: number
          created_at?: string
          id?: string
          nombre_producto?: string
          pedido_id?: string
          sku?: string
          updated_at?: string
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_detalle_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string
          created_at: string
          description: string | null
          display_name: string
          id: string
          name: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          name: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      pickers: {
        Row: {
          created_at: string
          id: string
          name: string
          products_processed_today: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          products_processed_today?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          products_processed_today?: number
          updated_at?: string
        }
        Relationships: []
      }
      picking_adjustments: {
        Row: {
          adjusted_at: string | null
          adjusted_by: string | null
          adjusted_by_name: string | null
          adjustment_type: string
          alternative_bins: Json | null
          created_at: string | null
          expected_quantity: number
          found_quantity: number
          id: string
          notes: string | null
          original_bin: string
          pedido_detalle_id: string | null
          pedido_id: string
          sku: string
        }
        Insert: {
          adjusted_at?: string | null
          adjusted_by?: string | null
          adjusted_by_name?: string | null
          adjustment_type: string
          alternative_bins?: Json | null
          created_at?: string | null
          expected_quantity: number
          found_quantity: number
          id?: string
          notes?: string | null
          original_bin: string
          pedido_detalle_id?: string | null
          pedido_id: string
          sku: string
        }
        Update: {
          adjusted_at?: string | null
          adjusted_by?: string | null
          adjusted_by_name?: string | null
          adjustment_type?: string
          alternative_bins?: Json | null
          created_at?: string | null
          expected_quantity?: number
          found_quantity?: number
          id?: string
          notes?: string | null
          original_bin?: string
          pedido_detalle_id?: string | null
          pedido_id?: string
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "picking_adjustments_adjusted_by_fkey"
            columns: ["adjusted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_adjustments_pedido_detalle_id_fkey"
            columns: ["pedido_detalle_id"]
            isOneToOne: false
            referencedRelation: "pedidos_detalle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_adjustments_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_libre_audit_log: {
        Row: {
          created_at: string
          details: Json | null
          duration_ms: number | null
          error_message: string | null
          event_status: string
          event_type: string
          id: string
          retry_count: number | null
          session_id: string | null
          stack_trace: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          event_status: string
          event_type: string
          id?: string
          retry_count?: number | null
          session_id?: string | null
          stack_trace?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          event_status?: string
          event_type?: string
          id?: string
          retry_count?: number | null
          session_id?: string | null
          stack_trace?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "picking_libre_audit_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "picking_libre_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_libre_emissions: {
        Row: {
          attempt_number: number
          bsale_document_id: number | null
          completed_at: string | null
          created_at: string
          emission_type: string
          error_details: Json | null
          error_message: string | null
          id: string
          idempotency_key: string
          request_payload: Json
          response_payload: Json | null
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_number?: number
          bsale_document_id?: number | null
          completed_at?: string | null
          created_at?: string
          emission_type: string
          error_details?: Json | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          request_payload: Json
          response_payload?: Json | null
          session_id: string
          status: string
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          bsale_document_id?: number | null
          completed_at?: string | null
          created_at?: string
          emission_type?: string
          error_details?: Json | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          request_payload?: Json
          response_payload?: Json | null
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "picking_libre_emissions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "picking_libre_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_libre_items: {
        Row: {
          bin_code: string
          id: string
          nombre_producto: string
          quantity: number
          scanned_at: string | null
          session_id: string | null
          sku: string
          stock_id: string | null
          variante: string | null
        }
        Insert: {
          bin_code: string
          id?: string
          nombre_producto: string
          quantity?: number
          scanned_at?: string | null
          session_id?: string | null
          sku: string
          stock_id?: string | null
          variante?: string | null
        }
        Update: {
          bin_code?: string
          id?: string
          nombre_producto?: string
          quantity?: number
          scanned_at?: string | null
          session_id?: string | null
          sku?: string
          stock_id?: string | null
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "picking_libre_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "picking_libre_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_libre_items_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stockxbin"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_libre_sessions: {
        Row: {
          bsale_response: Json | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          created_by_name: string
          data_version: number
          device_id: string | null
          documento_tipo: string | null
          id: string
          last_activity_at: string
          last_error: string | null
          notes: string | null
          productos_retirados_por: string | null
          retry_count: number
          status: string
          tienda_destino_id: string | null
          tipo_movimiento: string | null
          total_items: number | null
          transportista_id: string | null
          unique_products: number | null
          updated_at: string | null
          url_public_view: string | null
        }
        Insert: {
          bsale_response?: Json | null
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          created_by_name: string
          data_version?: number
          device_id?: string | null
          documento_tipo?: string | null
          id?: string
          last_activity_at?: string
          last_error?: string | null
          notes?: string | null
          productos_retirados_por?: string | null
          retry_count?: number
          status?: string
          tienda_destino_id?: string | null
          tipo_movimiento?: string | null
          total_items?: number | null
          transportista_id?: string | null
          unique_products?: number | null
          updated_at?: string | null
          url_public_view?: string | null
        }
        Update: {
          bsale_response?: Json | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          created_by_name?: string
          data_version?: number
          device_id?: string | null
          documento_tipo?: string | null
          id?: string
          last_activity_at?: string
          last_error?: string | null
          notes?: string | null
          productos_retirados_por?: string | null
          retry_count?: number
          status?: string
          tienda_destino_id?: string | null
          tipo_movimiento?: string | null
          total_items?: number | null
          transportista_id?: string | null
          unique_products?: number | null
          updated_at?: string | null
          url_public_view?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "picking_libre_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_libre_sessions_tienda_destino_id_fkey"
            columns: ["tienda_destino_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_libre_sessions_transportista_id_fkey"
            columns: ["transportista_id"]
            isOneToOne: false
            referencedRelation: "transportistas"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          attempts: number
          client_id: string | null
          created_at: string
          destino_impresora: string
          error_message: string | null
          fuente: string
          id: string
          printed_at: string | null
          referencia_id: string | null
          status: Database["public"]["Enums"]["print_job_status"]
          tipo: Database["public"]["Enums"]["print_job_tipo"]
          url_pdf: string
        }
        Insert: {
          attempts?: number
          client_id?: string | null
          created_at?: string
          destino_impresora: string
          error_message?: string | null
          fuente: string
          id?: string
          printed_at?: string | null
          referencia_id?: string | null
          status?: Database["public"]["Enums"]["print_job_status"]
          tipo: Database["public"]["Enums"]["print_job_tipo"]
          url_pdf: string
        }
        Update: {
          attempts?: number
          client_id?: string | null
          created_at?: string
          destino_impresora?: string
          error_message?: string | null
          fuente?: string
          id?: string
          printed_at?: string | null
          referencia_id?: string | null
          status?: Database["public"]["Enums"]["print_job_status"]
          tipo?: Database["public"]["Enums"]["print_job_tipo"]
          url_pdf?: string
        }
        Relationships: []
      }
      product_alerts_snapshot: {
        Row: {
          created_at: string | null
          desglose_tiendas: Json | null
          dias_cobertura: number
          id: string
          nombre_producto: string
          sku: string
          snapshot_date: string
          stock_total: number
          tiendas_con_stock: number
          tiendas_criticas: Json | null
          tiendas_sin_stock: number
          tiendas_sobrestock: Json | null
          tipo_producto: string | null
          updated_at: string | null
          valor_inventario: number | null
          venta_diaria: number
        }
        Insert: {
          created_at?: string | null
          desglose_tiendas?: Json | null
          dias_cobertura: number
          id?: string
          nombre_producto: string
          sku: string
          snapshot_date?: string
          stock_total: number
          tiendas_con_stock: number
          tiendas_criticas?: Json | null
          tiendas_sin_stock: number
          tiendas_sobrestock?: Json | null
          tipo_producto?: string | null
          updated_at?: string | null
          valor_inventario?: number | null
          venta_diaria: number
        }
        Update: {
          created_at?: string | null
          desglose_tiendas?: Json | null
          dias_cobertura?: number
          id?: string
          nombre_producto?: string
          sku?: string
          snapshot_date?: string
          stock_total?: number
          tiendas_con_stock?: number
          tiendas_criticas?: Json | null
          tiendas_sin_stock?: number
          tiendas_sobrestock?: Json | null
          tipo_producto?: string | null
          updated_at?: string | null
          valor_inventario?: number | null
          venta_diaria?: number
        }
        Relationships: []
      }
      productos_congelados: {
        Row: {
          congelado_por_usuario_id: string | null
          congelado_por_usuario_nombre: string | null
          created_at: string
          fecha_congelacion: string
          id: string
          motivo: string | null
          nombre_producto: string
          sku: string
          updated_at: string
        }
        Insert: {
          congelado_por_usuario_id?: string | null
          congelado_por_usuario_nombre?: string | null
          created_at?: string
          fecha_congelacion?: string
          id?: string
          motivo?: string | null
          nombre_producto: string
          sku: string
          updated_at?: string
        }
        Update: {
          congelado_por_usuario_id?: string | null
          congelado_por_usuario_nombre?: string | null
          created_at?: string
          fecha_congelacion?: string
          id?: string
          motivo?: string | null
          nombre_producto?: string
          sku?: string
          updated_at?: string
        }
        Relationships: []
      }
      productosBsale: {
        Row: {
          created_at: string
          id: number
          idProductType: number | null
          nameProductType: string | null
          nombreProducto: string | null
          shopify_product_id: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          idProductType?: number | null
          nameProductType?: string | null
          nombreProducto?: string | null
          shopify_product_id?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          idProductType?: number | null
          nameProductType?: string | null
          nombreProducto?: string | null
          shopify_product_id?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by_user_id: string | null
          deleted_by_user_name: string | null
          deletion_reason: string | null
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          signature_pin_created_at: string | null
          signature_pin_hash: string | null
          signature_pin_updated_at: string | null
          updated_at: string
          user_type_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by_user_id?: string | null
          deleted_by_user_name?: string | null
          deletion_reason?: string | null
          email: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          signature_pin_created_at?: string | null
          signature_pin_hash?: string | null
          signature_pin_updated_at?: string | null
          updated_at?: string
          user_type_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by_user_id?: string | null
          deleted_by_user_name?: string | null
          deletion_reason?: string | null
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          signature_pin_created_at?: string | null
          signature_pin_hash?: string | null
          signature_pin_updated_at?: string | null
          updated_at?: string
          user_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_user_type_id_fkey"
            columns: ["user_type_id"]
            isOneToOne: false
            referencedRelation: "user_types"
            referencedColumns: ["id"]
          },
        ]
      }
      registro_ventas_total: {
        Row: {
          Cantidad: number | null
          "Cliente Departamento": string | null
          "Cliente Dirección": string | null
          "Cliente Distrito": string | null
          "Cliente Provincia": string | null
          "Cliente RUC": string | null
          "Costo Neto Unitario": number | null
          "Costo Total Neto": number | null
          "Descuento Bruto": number | null
          "Descuento Neto": number | null
          "Email Cliente": string | null
          "Fecha de Emisión": string
          "Fecha y Hora Venta": string | null
          id: number
          "Lista de Precio": string | null
          Margen: number | null
          "Nombre Cliente": string | null
          "Número de serie": string | null
          "Numero Documento": number | null
          observacion_import: string | null
          "Precio Bruto Unitario": number | null
          "Precio Neto Unitario": number | null
          "Producto / Servicio": string | null
          SKU: string | null
          Sucursal: string | null
          sucursal_master_id: string | null
          sucursal_normalizada: string | null
          "Tipo de Producto / Servicio": string | null
          "Tipo Movimiento": string | null
          "Total Impuestos": number | null
          Variante: string | null
          Vendedor: string | null
          "Venta Total Bruta": number | null
          "Venta Total Neta": number | null
        }
        Insert: {
          Cantidad?: number | null
          "Cliente Departamento"?: string | null
          "Cliente Dirección"?: string | null
          "Cliente Distrito"?: string | null
          "Cliente Provincia"?: string | null
          "Cliente RUC"?: string | null
          "Costo Neto Unitario"?: number | null
          "Costo Total Neto"?: number | null
          "Descuento Bruto"?: number | null
          "Descuento Neto"?: number | null
          "Email Cliente"?: string | null
          "Fecha de Emisión": string
          "Fecha y Hora Venta"?: string | null
          id?: number
          "Lista de Precio"?: string | null
          Margen?: number | null
          "Nombre Cliente"?: string | null
          "Número de serie"?: string | null
          "Numero Documento"?: number | null
          observacion_import?: string | null
          "Precio Bruto Unitario"?: number | null
          "Precio Neto Unitario"?: number | null
          "Producto / Servicio"?: string | null
          SKU?: string | null
          Sucursal?: string | null
          sucursal_master_id?: string | null
          sucursal_normalizada?: string | null
          "Tipo de Producto / Servicio"?: string | null
          "Tipo Movimiento"?: string | null
          "Total Impuestos"?: number | null
          Variante?: string | null
          Vendedor?: string | null
          "Venta Total Bruta"?: number | null
          "Venta Total Neta"?: number | null
        }
        Update: {
          Cantidad?: number | null
          "Cliente Departamento"?: string | null
          "Cliente Dirección"?: string | null
          "Cliente Distrito"?: string | null
          "Cliente Provincia"?: string | null
          "Cliente RUC"?: string | null
          "Costo Neto Unitario"?: number | null
          "Costo Total Neto"?: number | null
          "Descuento Bruto"?: number | null
          "Descuento Neto"?: number | null
          "Email Cliente"?: string | null
          "Fecha de Emisión"?: string
          "Fecha y Hora Venta"?: string | null
          id?: number
          "Lista de Precio"?: string | null
          Margen?: number | null
          "Nombre Cliente"?: string | null
          "Número de serie"?: string | null
          "Numero Documento"?: number | null
          observacion_import?: string | null
          "Precio Bruto Unitario"?: number | null
          "Precio Neto Unitario"?: number | null
          "Producto / Servicio"?: string | null
          SKU?: string | null
          Sucursal?: string | null
          sucursal_master_id?: string | null
          sucursal_normalizada?: string | null
          "Tipo de Producto / Servicio"?: string | null
          "Tipo Movimiento"?: string | null
          "Total Impuestos"?: number | null
          Variante?: string | null
          Vendedor?: string | null
          "Venta Total Bruta"?: number | null
          "Venta Total Neta"?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "registro_ventas_total_sucursal_master_id_fkey"
            columns: ["sucursal_master_id"]
            isOneToOne: false
            referencedRelation: "sucursales_master"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sellers: {
        Row: {
          created_at: string
          firstName: string | null
          id: number
          lastName: string | null
        }
        Insert: {
          created_at?: string
          firstName?: string | null
          id?: number
          lastName?: string | null
        }
        Update: {
          created_at?: string
          firstName?: string | null
          id?: number
          lastName?: string | null
        }
        Relationships: []
      }
      shopify_image_sync_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          current_batch: number
          error_message: string | null
          force_refresh: boolean | null
          id: string
          products_failed: number
          products_skipped: number
          products_synced: number
          started_at: string
          started_by: string | null
          status: string
          total_batches: number
          total_products: number
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_batch?: number
          error_message?: string | null
          force_refresh?: boolean | null
          id?: string
          products_failed?: number
          products_skipped?: number
          products_synced?: number
          started_at?: string
          started_by?: string | null
          status?: string
          total_batches?: number
          total_products?: number
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_batch?: number
          error_message?: string | null
          force_refresh?: boolean | null
          id?: string
          products_failed?: number
          products_skipped?: number
          products_synced?: number
          started_at?: string
          started_by?: string | null
          status?: string
          total_batches?: number
          total_products?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopify_image_sync_sessions_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_product_images: {
        Row: {
          alt: string | null
          cached_at: string | null
          created_at: string | null
          height: number | null
          id: string
          is_general_image: boolean | null
          position: number | null
          product_id: number | null
          shopify_image_id: number
          shopify_product_id: number
          shopify_variant_id: number | null
          src: string
          updated_at: string | null
          variant_sku: string | null
          width: number | null
        }
        Insert: {
          alt?: string | null
          cached_at?: string | null
          created_at?: string | null
          height?: number | null
          id?: string
          is_general_image?: boolean | null
          position?: number | null
          product_id?: number | null
          shopify_image_id: number
          shopify_product_id: number
          shopify_variant_id?: number | null
          src: string
          updated_at?: string | null
          variant_sku?: string | null
          width?: number | null
        }
        Update: {
          alt?: string | null
          cached_at?: string | null
          created_at?: string | null
          height?: number | null
          id?: string
          is_general_image?: boolean | null
          position?: number | null
          product_id?: number | null
          shopify_image_id?: number
          shopify_product_id?: number
          shopify_variant_id?: number | null
          src?: string
          updated_at?: string | null
          variant_sku?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "productosBsale"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_product_images_variant_sku_fkey"
            columns: ["variant_sku"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["sku"]
          },
        ]
      }
      shopify_sync_details: {
        Row: {
          batch_number: number
          created_at: string
          error_message: string | null
          id: string
          product_id: number
          product_name: string
          session_id: string
          shopify_product_id: number | null
          status: string
          synced_at: string | null
        }
        Insert: {
          batch_number: number
          created_at?: string
          error_message?: string | null
          id?: string
          product_id: number
          product_name: string
          session_id: string
          shopify_product_id?: number | null
          status: string
          synced_at?: string | null
        }
        Update: {
          batch_number?: number
          created_at?: string
          error_message?: string | null
          id?: string
          product_id?: number
          product_name?: string
          session_id?: string
          shopify_product_id?: number | null
          status?: string
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_sync_details_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "shopify_sync_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_sync_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          current_batch: number
          error_message: string | null
          id: string
          last_error_at: string | null
          products_failed: number
          products_synced: number
          started_at: string
          started_by: string | null
          status: string
          total_batches: number
          total_products: number
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_batch?: number
          error_message?: string | null
          id?: string
          last_error_at?: string | null
          products_failed?: number
          products_synced?: number
          started_at?: string
          started_by?: string | null
          status?: string
          total_batches: number
          total_products: number
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_batch?: number
          error_message?: string | null
          id?: string
          last_error_at?: string | null
          products_failed?: number
          products_synced?: number
          started_at?: string
          started_by?: string | null
          status?: string
          total_batches?: number
          total_products?: number
          updated_at?: string
        }
        Relationships: []
      }
      stock_audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
        }
        Relationships: []
      }
      stock_consumption_details: {
        Row: {
          bin_code: string
          consumption_id: string
          created_at: string
          id: string
          nombre_producto: string
          quantity: number
          sku: string
          variante: string | null
        }
        Insert: {
          bin_code: string
          consumption_id: string
          created_at?: string
          id?: string
          nombre_producto: string
          quantity: number
          sku: string
          variante?: string | null
        }
        Update: {
          bin_code?: string
          consumption_id?: string
          created_at?: string
          id?: string
          nombre_producto?: string
          quantity?: number
          sku?: string
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_consumption_details_consumption_id_fkey"
            columns: ["consumption_id"]
            isOneToOne: false
            referencedRelation: "stock_consumptions"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_consumptions: {
        Row: {
          bsale_response: Json | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          document_number: number
          id: string
          internal_identifier: string | null
          note: string | null
          office_id: number
          total_items: number
          updated_at: string
        }
        Insert: {
          bsale_response?: Json | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          document_number: number
          id?: string
          internal_identifier?: string | null
          note?: string | null
          office_id?: number
          total_items?: number
          updated_at?: string
        }
        Update: {
          bsale_response?: Json | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          document_number?: number
          id?: string
          internal_identifier?: string | null
          note?: string | null
          office_id?: number
          total_items?: number
          updated_at?: string
        }
        Relationships: []
      }
      stock_reception_details: {
        Row: {
          bin_code: string
          created_at: string
          id: string
          nombre_producto: string
          quantity: number
          reception_id: string
          sku: string
          unit_cost: number | null
          variante: string | null
        }
        Insert: {
          bin_code: string
          created_at?: string
          id?: string
          nombre_producto: string
          quantity: number
          reception_id: string
          sku: string
          unit_cost?: number | null
          variante?: string | null
        }
        Update: {
          bin_code?: string
          created_at?: string
          id?: string
          nombre_producto?: string
          quantity?: number
          reception_id?: string
          sku?: string
          unit_cost?: number | null
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_reception_details_reception_id_fkey"
            columns: ["reception_id"]
            isOneToOne: false
            referencedRelation: "stock_receptions"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_receptions: {
        Row: {
          bsale_response: Json | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          document_number: number
          document_type: string
          id: string
          internal_identifier: string | null
          note: string | null
          office_id: number
          total_items: number
          updated_at: string
        }
        Insert: {
          bsale_response?: Json | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          document_number: number
          document_type?: string
          id?: string
          internal_identifier?: string | null
          note?: string | null
          office_id?: number
          total_items?: number
          updated_at?: string
        }
        Update: {
          bsale_response?: Json | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          document_number?: number
          document_type?: string
          id?: string
          internal_identifier?: string | null
          note?: string | null
          office_id?: number
          total_items?: number
          updated_at?: string
        }
        Relationships: []
      }
      stock_snapshot_pre_migracion: {
        Row: {
          bin: string
          comprometido: number
          disponibles: number
          en_existencia: number
          id: string
          reservado: number
          sku: string
          snapshot_at: string | null
        }
        Insert: {
          bin: string
          comprometido: number
          disponibles: number
          en_existencia: number
          id: string
          reservado: number
          sku: string
          snapshot_at?: string | null
        }
        Update: {
          bin?: string
          comprometido?: number
          disponibles?: number
          en_existencia?: number
          id?: string
          reservado?: number
          sku?: string
          snapshot_at?: string | null
        }
        Relationships: []
      }
      stock_totals: {
        Row: {
          created_at: string
          id: string
          sku: string
          total_comprometido: number
          total_disponible: number
          total_en_existencia: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          sku: string
          total_comprometido?: number
          total_disponible?: number
          total_en_existencia?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          sku?: string
          total_comprometido?: number
          total_disponible?: number
          total_en_existencia?: number
          updated_at?: string
        }
        Relationships: []
      }
      stocks_tiendas_bsale: {
        Row: {
          almCentral: number | null
          almhyo: number | null
          ancash: number | null
          created_at: string
          guizado: number | null
          id: string
          idVariant: string
          open: number | null
          rCuzco: number | null
          rLima: number | null
          rPlaza: number | null
          sku: string
          tarpuy1: number | null
          tarpuy2: number | null
          zapaton: number | null
        }
        Insert: {
          almCentral?: number | null
          almhyo?: number | null
          ancash?: number | null
          created_at?: string
          guizado?: number | null
          id?: string
          idVariant: string
          open?: number | null
          rCuzco?: number | null
          rLima?: number | null
          rPlaza?: number | null
          sku: string
          tarpuy1?: number | null
          tarpuy2?: number | null
          zapaton?: number | null
        }
        Update: {
          almCentral?: number | null
          almhyo?: number | null
          ancash?: number | null
          created_at?: string
          guizado?: number | null
          id?: string
          idVariant?: string
          open?: number | null
          rCuzco?: number | null
          rLima?: number | null
          rPlaza?: number | null
          sku?: string
          tarpuy1?: number | null
          tarpuy2?: number | null
          zapaton?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stocks_tiendas_bsale_idVariant_fkey"
            columns: ["idVariant"]
            isOneToOne: true
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocks_tiendas_bsale_sku_fkey"
            columns: ["sku"]
            isOneToOne: true
            referencedRelation: "variants"
            referencedColumns: ["sku"]
          },
        ]
      }
      stockxbin: {
        Row: {
          bin: string | null
          comprometido: number | null
          created_at: string
          disponibles: number | null
          en_existencia: number | null
          id: string
          idBsale: string
          reservado: number | null
          sku: string | null
          updated_at: string
        }
        Insert: {
          bin?: string | null
          comprometido?: number | null
          created_at?: string
          disponibles?: number | null
          en_existencia?: number | null
          id?: string
          idBsale: string
          reservado?: number | null
          sku?: string | null
          updated_at?: string
        }
        Update: {
          bin?: string | null
          comprometido?: number | null
          created_at?: string
          disponibles?: number | null
          en_existencia?: number | null
          id?: string
          idBsale?: string
          reservado?: number | null
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stockxbin_bin_fkey"
            columns: ["bin"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["bin_code"]
          },
          {
            foreignKeyName: "stockxbin_idBsale_fkey"
            columns: ["idBsale"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stockxbin_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["sku"]
          },
        ]
      }
      store_composition_snapshots: {
        Row: {
          created_at: string
          id: string
          product_type: string
          quantity: number
          snapshot_date: string
          store_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_type: string
          quantity?: number
          snapshot_date: string
          store_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_type?: string
          quantity?: number
          snapshot_date?: string
          store_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sucursales_aliases: {
        Row: {
          created_at: string
          fuente: string | null
          id: string
          nombre_alternativo: string
          prioridad: number | null
          sucursal_master_id: string
        }
        Insert: {
          created_at?: string
          fuente?: string | null
          id?: string
          nombre_alternativo: string
          prioridad?: number | null
          sucursal_master_id: string
        }
        Update: {
          created_at?: string
          fuente?: string | null
          id?: string
          nombre_alternativo?: string
          prioridad?: number | null
          sucursal_master_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sucursales_aliases_sucursal_master_id_fkey"
            columns: ["sucursal_master_id"]
            isOneToOne: false
            referencedRelation: "sucursales_master"
            referencedColumns: ["id"]
          },
        ]
      }
      sucursales_dim: {
        Row: {
          created_at: string
          first_sale_date: string | null
          id: string
          last_sale_date: string | null
          nombre: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_sale_date?: string | null
          id?: string
          last_sale_date?: string | null
          nombre: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_sale_date?: string | null
          id?: string
          last_sale_date?: string | null
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      sucursales_master: {
        Row: {
          activa: boolean
          codigo: string | null
          created_at: string
          fecha_apertura: string | null
          fecha_cierre: string | null
          id: string
          metadata: Json | null
          nombre_canonical: string
          updated_at: string
        }
        Insert: {
          activa?: boolean
          codigo?: string | null
          created_at?: string
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          id?: string
          metadata?: Json | null
          nombre_canonical: string
          updated_at?: string
        }
        Update: {
          activa?: boolean
          codigo?: string | null
          created_at?: string
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          id?: string
          metadata?: Json | null
          nombre_canonical?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      tiendas: {
        Row: {
          accept_remision_guide: boolean | null
          address: string | null
          city: string | null
          code_bsale_sunat: string | null
          created_at: string
          district: string | null
          id: string
          nombre: string
          officeid: string | null
          pertenenceinnovacion: boolean | null
          recipient: string | null
          recipient_ruc: number | null
          ubigeo_tiendas: number | null
          updated_at: string
        }
        Insert: {
          accept_remision_guide?: boolean | null
          address?: string | null
          city?: string | null
          code_bsale_sunat?: string | null
          created_at?: string
          district?: string | null
          id?: string
          nombre: string
          officeid?: string | null
          pertenenceinnovacion?: boolean | null
          recipient?: string | null
          recipient_ruc?: number | null
          ubigeo_tiendas?: number | null
          updated_at?: string
        }
        Update: {
          accept_remision_guide?: boolean | null
          address?: string | null
          city?: string | null
          code_bsale_sunat?: string | null
          created_at?: string
          district?: string | null
          id?: string
          nombre?: string
          officeid?: string | null
          pertenenceinnovacion?: boolean | null
          recipient?: string | null
          recipient_ruc?: number | null
          ubigeo_tiendas?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      transportistas: {
        Row: {
          created_at: string
          id: string
          nombre_empresa: string
          ruc: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre_empresa: string
          ruc: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre_empresa?: string
          ruc?: string
          updated_at?: string
        }
        Relationships: []
      }
      traslados_internos: {
        Row: {
          address: string
          bsale_guide_id: number | null
          bsale_response: Json | null
          city: string
          created_at: string
          destination_office_id: string
          district: string
          document_number: number
          emission_date: number
          id: string
          office_id: number
          pedido_id: string | null
          recipient: string
          sucursal_destino_nombre: string | null
          tienda_id: string | null
          total_items: number
          updated_at: string
          url_public_view: string | null
        }
        Insert: {
          address?: string
          bsale_guide_id?: number | null
          bsale_response?: Json | null
          city?: string
          created_at?: string
          destination_office_id: string
          district?: string
          document_number: number
          emission_date: number
          id?: string
          office_id?: number
          pedido_id?: string | null
          recipient?: string
          sucursal_destino_nombre?: string | null
          tienda_id?: string | null
          total_items?: number
          updated_at?: string
          url_public_view?: string | null
        }
        Update: {
          address?: string
          bsale_guide_id?: number | null
          bsale_response?: Json | null
          city?: string
          created_at?: string
          destination_office_id?: string
          district?: string
          document_number?: number
          emission_date?: number
          id?: string
          office_id?: number
          pedido_id?: string | null
          recipient?: string
          sucursal_destino_nombre?: string | null
          tienda_id?: string | null
          total_items?: number
          updated_at?: string
          url_public_view?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traslados_internos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traslados_internos_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      traslados_internos_detalle: {
        Row: {
          created_at: string
          id: string
          net_unit_value: number
          quantity: number
          sku: string
          traslado_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          net_unit_value: number
          quantity: number
          sku: string
          traslado_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          net_unit_value?: number
          quantity?: number
          sku?: string
          traslado_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "traslados_internos_detalle_traslado_id_fkey"
            columns: ["traslado_id"]
            isOneToOne: false
            referencedRelation: "traslados_internos"
            referencedColumns: ["id"]
          },
        ]
      }
      traslados_internos_sussy: {
        Row: {
          cargado_a_sussy: number | null
          "client.id": string | null
          created_at: string
          document_type: string | null
          emissionDate: string | null
          expirationDate: string | null
          generationDate: string | null
          href: string | null
          id: string
          number: number | null
          serialNumber: string | null
          urlPdf: string | null
          urlPublicView: string | null
        }
        Insert: {
          cargado_a_sussy?: number | null
          "client.id"?: string | null
          created_at?: string
          document_type?: string | null
          emissionDate?: string | null
          expirationDate?: string | null
          generationDate?: string | null
          href?: string | null
          id: string
          number?: number | null
          serialNumber?: string | null
          urlPdf?: string | null
          urlPublicView?: string | null
        }
        Update: {
          cargado_a_sussy?: number | null
          "client.id"?: string | null
          created_at?: string
          document_type?: string | null
          emissionDate?: string | null
          expirationDate?: string | null
          generationDate?: string | null
          href?: string | null
          id?: string
          number?: number | null
          serialNumber?: string | null
          urlPdf?: string | null
          urlPublicView?: string | null
        }
        Relationships: []
      }
      ubicaciones_temporales: {
        Row: {
          id: number
          sku: string | null
          ubicacion: string | null
        }
        Insert: {
          id?: number
          sku?: string | null
          ubicacion?: string | null
        }
        Update: {
          id?: number
          sku?: string | null
          ubicacion?: string | null
        }
        Relationships: []
      }
      ubigeos: {
        Row: {
          codigo: string
          created_at: string
          departamento: string
          distrito: string
          id: string
          nombre_completo: string
          provincia: string
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          departamento: string
          distrito: string
          id?: string
          nombre_completo: string
          provincia: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          departamento?: string
          distrito?: string
          id?: string
          nombre_completo?: string
          provincia?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_type_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          user_type_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          user_type_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          user_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_type_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_type_permissions_user_type_id_fkey"
            columns: ["user_type_id"]
            isOneToOne: false
            referencedRelation: "user_types"
            referencedColumns: ["id"]
          },
        ]
      }
      user_types: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_admin: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_admin?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_admin?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      variants: {
        Row: {
          costo: number | null
          created_at: string
          id: string
          idProductoBsale: number | null
          lista_x_12: number | null
          nameProductType: string | null
          nombreProducto: string
          precio_base: number | null
          product_type_id: number | null
          shopify_variant_id: number | null
          sku: string | null
          updated_at: string
          variant_value_12: number | null
          variante: string | null
        }
        Insert: {
          costo?: number | null
          created_at?: string
          id: string
          idProductoBsale?: number | null
          lista_x_12?: number | null
          nameProductType?: string | null
          nombreProducto: string
          precio_base?: number | null
          product_type_id?: number | null
          shopify_variant_id?: number | null
          sku?: string | null
          updated_at?: string
          variant_value_12?: number | null
          variante?: string | null
        }
        Update: {
          costo?: number | null
          created_at?: string
          id?: string
          idProductoBsale?: number | null
          lista_x_12?: number | null
          nameProductType?: string | null
          nombreProducto?: string
          precio_base?: number | null
          product_type_id?: number | null
          shopify_variant_id?: number | null
          sku?: string | null
          updated_at?: string
          variant_value_12?: number | null
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variants_idProductoBsale_fkey"
            columns: ["idProductoBsale"]
            isOneToOne: false
            referencedRelation: "productosBsale"
            referencedColumns: ["id"]
          },
        ]
      }
      variants_instancia_sussy: {
        Row: {
          id: number
          id_producto_bsale: string | null
          id_producto_innovacion: number | null
          id_variante_innovacion: number | null
          nombre_producto: string | null
          sku: string | null
          variante: string | null
        }
        Insert: {
          id?: number
          id_producto_bsale?: string | null
          id_producto_innovacion?: number | null
          id_variante_innovacion?: number | null
          nombre_producto?: string | null
          sku?: string | null
          variante?: string | null
        }
        Update: {
          id?: number
          id_producto_bsale?: string | null
          id_producto_innovacion?: number | null
          id_variante_innovacion?: number | null
          nombre_producto?: string | null
          sku?: string | null
          variante?: string | null
        }
        Relationships: []
      }
      ventas: {
        Row: {
          cliente_info: Json
          created_at: string
          details_href: string | null
          documento_tipo: Database["public"]["Enums"]["documento_tipo"] | null
          eliminado_por_usuario_id: string | null
          eliminado_por_usuario_nombre: string | null
          envio_info: Json
          estado: Database["public"]["Enums"]["venta_estado"]
          facturacion_info: Json | null
          fecha_eliminacion: string | null
          guia_remision: boolean
          id: string
          id_bsale_documento: number | null
          igv: number
          metodo_pago: string
          motivo_eliminacion: string | null
          notas: string | null
          numero_operacion: string | null
          requiere_guia_remision: boolean | null
          seller_id: number | null
          serial_number: string | null
          subtotal: number
          total: number
          transportista_id: string | null
          updated_at: string
          url_guia_remision: string | null
          url_public_view: string | null
          venta_id: string
        }
        Insert: {
          cliente_info: Json
          created_at?: string
          details_href?: string | null
          documento_tipo?: Database["public"]["Enums"]["documento_tipo"] | null
          eliminado_por_usuario_id?: string | null
          eliminado_por_usuario_nombre?: string | null
          envio_info: Json
          estado?: Database["public"]["Enums"]["venta_estado"]
          facturacion_info?: Json | null
          fecha_eliminacion?: string | null
          guia_remision?: boolean
          id?: string
          id_bsale_documento?: number | null
          igv?: number
          metodo_pago?: string
          motivo_eliminacion?: string | null
          notas?: string | null
          numero_operacion?: string | null
          requiere_guia_remision?: boolean | null
          seller_id?: number | null
          serial_number?: string | null
          subtotal?: number
          total?: number
          transportista_id?: string | null
          updated_at?: string
          url_guia_remision?: string | null
          url_public_view?: string | null
          venta_id: string
        }
        Update: {
          cliente_info?: Json
          created_at?: string
          details_href?: string | null
          documento_tipo?: Database["public"]["Enums"]["documento_tipo"] | null
          eliminado_por_usuario_id?: string | null
          eliminado_por_usuario_nombre?: string | null
          envio_info?: Json
          estado?: Database["public"]["Enums"]["venta_estado"]
          facturacion_info?: Json | null
          fecha_eliminacion?: string | null
          guia_remision?: boolean
          id?: string
          id_bsale_documento?: number | null
          igv?: number
          metodo_pago?: string
          motivo_eliminacion?: string | null
          notas?: string | null
          numero_operacion?: string | null
          requiere_guia_remision?: boolean | null
          seller_id?: number | null
          serial_number?: string | null
          subtotal?: number
          total?: number
          transportista_id?: string | null
          updated_at?: string
          url_guia_remision?: string | null
          url_public_view?: string | null
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_transportista_id_fkey"
            columns: ["transportista_id"]
            isOneToOne: false
            referencedRelation: "transportistas"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_asignaciones: {
        Row: {
          bin: string
          cantidad_asignada: number
          created_at: string
          id: string
          sku: string
          stock_id: string
          venta_detalle_id: string
          venta_id: string
        }
        Insert: {
          bin: string
          cantidad_asignada: number
          created_at?: string
          id?: string
          sku: string
          stock_id: string
          venta_detalle_id: string
          venta_id: string
        }
        Update: {
          bin?: string
          cantidad_asignada?: number
          created_at?: string
          id?: string
          sku?: string
          stock_id?: string
          venta_detalle_id?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_asignaciones_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stockxbin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_asignaciones_venta_detalle_id_fkey"
            columns: ["venta_detalle_id"]
            isOneToOne: false
            referencedRelation: "ventas_detalle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_asignaciones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_asignaciones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_asignaciones_audit: {
        Row: {
          bin: string
          cantidad_asignada: number
          created_at: string
          function_name: string | null
          id: string
          new_data: Json | null
          notes: string | null
          old_data: Json | null
          operation: string
          session_info: Json | null
          sku: string
          stack_trace: string | null
          trigger_name: string | null
          triggered_by: string | null
          user_email: string | null
          user_id: string | null
          venta_asignacion_id: string
          venta_codigo: string
          venta_id: string
        }
        Insert: {
          bin: string
          cantidad_asignada: number
          created_at?: string
          function_name?: string | null
          id?: string
          new_data?: Json | null
          notes?: string | null
          old_data?: Json | null
          operation: string
          session_info?: Json | null
          sku: string
          stack_trace?: string | null
          trigger_name?: string | null
          triggered_by?: string | null
          user_email?: string | null
          user_id?: string | null
          venta_asignacion_id: string
          venta_codigo: string
          venta_id: string
        }
        Update: {
          bin?: string
          cantidad_asignada?: number
          created_at?: string
          function_name?: string | null
          id?: string
          new_data?: Json | null
          notes?: string | null
          old_data?: Json | null
          operation?: string
          session_info?: Json | null
          sku?: string
          stack_trace?: string | null
          trigger_name?: string | null
          triggered_by?: string | null
          user_email?: string | null
          user_id?: string | null
          venta_asignacion_id?: string
          venta_codigo?: string
          venta_id?: string
        }
        Relationships: []
      }
      ventas_audit_log: {
        Row: {
          accion: string
          created_at: string
          detalles: Json | null
          estado_anterior: string | null
          estado_nuevo: string | null
          id: string
          usuario_id: string | null
          usuario_nombre: string | null
          venta_codigo: string
          venta_id: string
        }
        Insert: {
          accion: string
          created_at?: string
          detalles?: Json | null
          estado_anterior?: string | null
          estado_nuevo?: string | null
          id?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
          venta_codigo: string
          venta_id: string
        }
        Update: {
          accion?: string
          created_at?: string
          detalles?: Json | null
          estado_anterior?: string | null
          estado_nuevo?: string | null
          id?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
          venta_codigo?: string
          venta_id?: string
        }
        Relationships: []
      }
      ventas_detalle: {
        Row: {
          cantidad: number
          created_at: string
          detail_id_bsale: number | null
          id: string
          nombre_producto: string
          precio_unitario: number
          sku: string
          subtotal_linea: number
          updated_at: string
          valor_unitario: number
          variante: string | null
          venta_id: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          detail_id_bsale?: number | null
          id?: string
          nombre_producto: string
          precio_unitario: number
          sku: string
          subtotal_linea: number
          updated_at?: string
          valor_unitario: number
          variante?: string | null
          venta_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          detail_id_bsale?: number | null
          id?: string
          nombre_producto?: string
          precio_unitario?: number
          sku?: string
          subtotal_linea?: number
          updated_at?: string
          valor_unitario?: number
          variante?: string | null
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_detalle_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_detalle_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      vista_refresh_control: {
        Row: {
          created_at: string | null
          last_refresh: string | null
          vista_name: string
        }
        Insert: {
          created_at?: string | null
          last_refresh?: string | null
          vista_name: string
        }
        Update: {
          created_at?: string | null
          last_refresh?: string | null
          vista_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      dias_cobertura_por_tienda_tipo: {
        Row: {
          dias_cobertura: number | null
          stock_total: number | null
          tienda: string | null
          tipo_producto: string | null
          venta_diaria: number | null
        }
        Relationships: []
      }
      dias_cobertura_por_tienda_tipo_mv: {
        Row: {
          dias_cobertura: number | null
          stock_total: number | null
          tienda: string | null
          tipo_producto: string | null
          venta_diaria: number | null
        }
        Relationships: []
      }
      inv_stock_long: {
        Row: {
          sku: string | null
          stock: number | null
          tienda: string | null
        }
        Relationships: []
      }
      v_sucursales_sin_normalizar: {
        Row: {
          nombre_original: string | null
          registros_afectados: number | null
        }
        Relationships: []
      }
      ventas_mensuales_agregadas: {
        Row: {
          año: number | null
          dia: number | null
          ingresos_totales: number | null
          mes: number | null
          num_transacciones: number | null
          sucursal: string | null
          sucursal_id: string | null
          unidades_vendidas: number | null
        }
        Relationships: []
      }
      ventas_mensuales_realmente_agregadas: {
        Row: {
          año: number | null
          ingresos_totales: number | null
          mes: number | null
          num_transacciones: number | null
          unidades_vendidas: number | null
        }
        Relationships: []
      }
      ventas_secure: {
        Row: {
          cliente_info: Json | null
          created_at: string | null
          estado: Database["public"]["Enums"]["venta_estado"] | null
          id: string | null
          igv: number | null
          metodo_pago: string | null
          notas: string | null
          serial_number: string | null
          subtotal: number | null
          total: number | null
          updated_at: string | null
          url_public_view: string | null
          venta_id: string | null
        }
        Insert: {
          cliente_info?: never
          created_at?: string | null
          estado?: Database["public"]["Enums"]["venta_estado"] | null
          id?: string | null
          igv?: never
          metodo_pago?: string | null
          notas?: string | null
          serial_number?: string | null
          subtotal?: never
          total?: never
          updated_at?: string | null
          url_public_view?: string | null
          venta_id?: string | null
        }
        Update: {
          cliente_info?: never
          created_at?: string | null
          estado?: Database["public"]["Enums"]["venta_estado"] | null
          id?: string | null
          igv?: never
          metodo_pago?: string | null
          notas?: string | null
          serial_number?: string | null
          subtotal?: never
          total?: never
          updated_at?: string | null
          url_public_view?: string | null
          venta_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_order_quantity: {
        Args: { p_detalle_id: string; p_new_quantity: number; p_reason: string }
        Returns: Json
      }
      assign_bins_to_order: { Args: { order_id: string }; Returns: Json }
      assign_bins_to_sale: { Args: { sale_id: string }; Returns: boolean }
      assign_bins_to_sale_strict:
        | { Args: { sale_id: string }; Returns: Json }
        | {
            Args: { sale_id_param: string; skip_frozen_check?: boolean }
            Returns: Json
          }
      assign_bins_to_sale_v2: { Args: { sale_id: string }; Returns: Json }
      backfill_sucursales_dim: { Args: never; Returns: undefined }
      can_access_financial_data: { Args: never; Returns: boolean }
      can_sign_orders: { Args: never; Returns: boolean }
      can_sign_with_pin: { Args: never; Returns: boolean }
      cancel_picking_session: { Args: { p_session_id: string }; Returns: Json }
      check_bin_can_start_inventory: {
        Args: { bin_code_param: string; force_param?: boolean }
        Returns: Json
      }
      cleanup_inactive_picking_sessions: {
        Args: { p_minutes?: number }
        Returns: Json
      }
      cleanup_old_picking_sessions: {
        Args: { p_hours_old?: number }
        Returns: Json
      }
      cleanup_orphaned_assignments: { Args: never; Returns: Json }
      complete_emission_failure: {
        Args: {
          p_emission_id: string
          p_error_details?: Json
          p_error_message: string
        }
        Returns: boolean
      }
      complete_emission_success: {
        Args: {
          p_bsale_document_id?: number
          p_emission_id: string
          p_response_payload: Json
        }
        Returns: boolean
      }
      complete_picking_libre_safe: {
        Args: {
          p_documento_tipo: string
          p_session_id: string
          p_tienda_id: string
          p_transportista_id?: string
        }
        Returns: Json
      }
      consume_picking_libre_stock_strict: {
        Args: { p_expected_version?: number; p_session_id: string }
        Returns: {
          error_message: string
          items_updated: number
          new_version: number
          success: boolean
        }[]
      }
      consume_stock_for_sale_fallback: {
        Args: { sale_id_param: string }
        Returns: Json
      }
      consume_stock_from_reservado: {
        Args: { sale_id_param: string }
        Returns: Json
      }
      consume_stock_from_reserved: {
        Args: { sale_id_param: string }
        Returns: Json
      }
      consume_stock_strict: { Args: { sale_id_param: string }; Returns: Json }
      create_composition_snapshot: {
        Args: { snapshot_date_param?: string }
        Returns: Json
      }
      create_daily_stock_snapshot: {
        Args: { target_date?: string }
        Returns: number
      }
      create_inventory_age_snapshot: { Args: never; Returns: undefined }
      create_margin_inventory_age_snapshot: { Args: never; Returns: Json }
      create_order_atomic: {
        Args: {
          p_productos: Json
          p_tienda_id: string
          p_tienda_nombre: string
        }
        Returns: Json
      }
      decrement_picking_item_quantity: {
        Args: { p_bin_code: string; p_session_id: string; p_sku: string }
        Returns: Json
      }
      delete_multiple_zombie_sessions: {
        Args: { p_session_ids: string[] }
        Returns: Json
      }
      delete_order_completely: {
        Args: { order_pedido_id: string }
        Returns: boolean
      }
      delete_order_with_stock_release: {
        Args: {
          deleted_by_user_id: string
          deleted_by_user_name: string
          order_uuid: string
        }
        Returns: boolean
      }
      delete_sale_with_stock_release: {
        Args: {
          deleted_by_user_id: string
          deleted_by_user_name: string
          sale_uuid: string
        }
        Returns: boolean
      }
      delete_zombie_session: { Args: { p_session_id: string }; Returns: Json }
      detect_stock_inconsistencies: {
        Args: never
        Returns: {
          bin: string
          calculated_reservado: number
          current_reservado: number
          difference: number
          sku: string
          stock_id: string
        }[]
      }
      detect_zombie_sessions: {
        Args: never
        Returns: {
          created_at: string
          last_activity_at: string
          last_error: string
          minutes_inactive: number
          retry_count: number
          session_id: string
          status: string
          zombie_type: string
        }[]
      }
      finalize_picking_session_atomic: {
        Args: {
          p_documento_tipo: string
          p_expected_version: number
          p_notes?: string
          p_session_id: string
          p_tienda_destino_id: string
          p_transportista_id?: string
        }
        Returns: {
          error_message: string
          new_status: string
          new_version: number
          stock_errors: Json
          success: boolean
        }[]
      }
      find_alternative_bins: {
        Args: {
          p_exclude_bin?: string
          p_quantity_needed: number
          p_sku: string
        }
        Returns: {
          available_quantity: number
          bin_code: string
          committed_quantity: number
          is_frozen: boolean
          stock_id: string
        }[]
      }
      finish_bin_inventory: {
        Args: {
          changes_param: Json
          finished_by_name_param: string
          finished_by_param: string
          inventory_id_param: string
        }
        Returns: Json
      }
      fix_historical_stock_consumption: {
        Args: { dry_run?: boolean; limit_ventas?: number }
        Returns: {
          detalles: Json
          total_productos_corregidos: number
          total_unidades_restadas: number
          total_ventas_corregidas: number
          ventas_con_errores: number
        }[]
      }
      fix_negative_committed_stock: { Args: never; Returns: Json }
      fix_specific_sales_stock: {
        Args: { dry_run?: boolean; venta_codes: string[] }
        Returns: {
          detalles: Json
          productos_corregidos: number
          resultado: string
          unidades_restadas: number
          venta_codigo: string
        }[]
      }
      fix_stock_inconsistencies: { Args: never; Returns: Json }
      generate_idempotency_key: {
        Args: { p_attempt_number: number; p_session_id: string }
        Returns: string
      }
      generate_signature_hash: {
        Args: {
          p_order_id: string
          p_order_type: string
          p_signed_at: string
          p_signed_by: string
        }
        Returns: string
      }
      get_almcentral_total: { Args: never; Returns: number }
      get_assignment_history: {
        Args: { venta_codigo_param: string }
        Returns: {
          bin: string
          cantidad: number
          created_at: string
          function_name: string
          notes: string
          operation: string
          sku: string
          triggered_by: string
          user_email: string
        }[]
      }
      get_current_user_profile_role: { Args: never; Returns: string }
      get_current_user_role: { Args: never; Returns: string }
      get_distinct_sucursales: {
        Args: never
        Returns: {
          sucursal_normalizada: string
        }[]
      }
      get_feature_flag: { Args: { p_flag_key: string }; Returns: Json }
      get_latest_product_alerts: {
        Args: never
        Returns: {
          desglose_tiendas: Json
          dias_cobertura: number
          nombre_producto: string
          sku: string
          stock_total: number
          tiendas_con_stock: number
          tiendas_criticas: Json
          tiendas_sin_stock: number
          tiendas_sobrestock: Json
          tipo_producto: string
          valor_inventario: number
          venta_diaria: number
        }[]
      }
      get_margin_vs_inventory_age: {
        Args: { p_dias_periodo?: number; p_sucursal?: string }
        Returns: {
          categoria: string
          edad_promedio_dias: number
          margen_pct: number
          num_productos: number
          ventas_totales: number
        }[]
      }
      get_next_consumption_number: { Args: never; Returns: number }
      get_next_document_number: { Args: never; Returns: number }
      get_next_order_number: { Args: never; Returns: string }
      get_next_sales_number: { Args: never; Returns: string }
      get_next_transfer_number: { Args: never; Returns: number }
      get_or_create_emission: {
        Args: {
          p_emission_type: string
          p_request_payload: Json
          p_session_id: string
        }
        Returns: Json
      }
      get_processed_orders_today: {
        Args: { end_date: string; start_date: string }
        Returns: number
      }
      get_product_coverage_alerts: {
        Args: never
        Returns: {
          desglose_tiendas: Json
          dias_cobertura: number
          nombre_producto: string
          sku: string
          stock_total: number
          tiendas_con_stock: number
          tiendas_criticas: Json
          tiendas_sin_stock: number
          tiendas_sobrestock: Json
          tipo_producto: string
          valor_inventario: number
          venta_diaria: number
        }[]
      }
      get_products_processed_last_30_days: { Args: never; Returns: number }
      get_sales_count_last_30_days: { Args: never; Returns: number }
      get_secure_sales: {
        Args: { limit_count?: number; offset_count?: number }
        Returns: {
          cliente_info: Json
          created_at: string
          estado: Database["public"]["Enums"]["venta_estado"]
          id: string
          igv: number
          metodo_pago: string
          notas: string
          subtotal: number
          total: number
          updated_at: string
          venta_id: string
        }[]
      }
      get_stock_composition_almcentral: {
        Args: never
        Returns: {
          name: string
          value: number
        }[]
      }
      get_vistas_status: {
        Args: never
        Returns: {
          last_refresh: string
          minutes_ago: number
          status: string
          vista_name: string
        }[]
      }
      get_ytd_monthly: {
        Args: never
        Returns: {
          mes: string
          ventas_totales: number
        }[]
      }
      get_ytd_summary: {
        Args: never
        Returns: {
          ticket_promedio_ytd: number
          total_documentos_ytd: number
          total_items_ytd: number
          total_ventas_ytd: number
        }[]
      }
      get_ytd_top_categories: {
        Args: { limit_count?: number }
        Returns: {
          categoria: string
          ventas_totales: number
        }[]
      }
      get_zombie_sessions_stats: { Args: never; Returns: Json }
      has_role: {
        Args: {
          check_role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Returns: boolean
      }
      increment_shopify_image_sync_stats: {
        Args: {
          p_current_batch?: number
          p_failed?: number
          p_session_id: string
          p_skipped?: number
          p_synced?: number
        }
        Returns: undefined
      }
      increment_shopify_sync_stats: {
        Args: { p_session_id: string; p_success: boolean }
        Returns: undefined
      }
      insert_security_audit_log: {
        Args: {
          p_action: string
          p_details?: Json
          p_ip_address?: string
          p_record_id?: string
          p_table_name?: string
          p_user_agent?: string
          p_user_id: string
        }
        Returns: boolean
      }
      is_admin_or_supervisor: { Args: { user_id: string }; Returns: boolean }
      is_current_user_admin_type: { Args: never; Returns: boolean }
      is_migration_mode_active: { Args: never; Returns: boolean }
      is_product_frozen_for_transfer: {
        Args: { product_sku: string }
        Returns: boolean
      }
      is_target_user_admin: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      log_pedido_state_change: {
        Args: {
          p_accion: string
          p_detalles?: Json
          p_estado_anterior?: string
          p_estado_nuevo?: string
          p_pedido_codigo: string
          p_pedido_id: string
          p_usuario_id?: string
          p_usuario_nombre?: string
        }
        Returns: boolean
      }
      log_picking_libre_event: {
        Args: {
          p_details?: Json
          p_duration_ms?: number
          p_error_message?: string
          p_event_status: string
          p_event_type: string
          p_retry_count?: number
          p_session_id: string
          p_stack_trace?: string
          p_user_id?: string
          p_user_name?: string
        }
        Returns: string
      }
      log_sensitive_data_access: {
        Args: { operation: string; record_id: string; table_name: string }
        Returns: undefined
      }
      log_signature_attempt: {
        Args: {
          p_action: string
          p_details: Json
          p_record_id: string
          p_table_name: string
          p_user_id: string
        }
        Returns: undefined
      }
      log_venta_state_change: {
        Args: {
          p_accion: string
          p_detalles?: Json
          p_estado_anterior?: string
          p_estado_nuevo?: string
          p_usuario_id?: string
          p_usuario_nombre?: string
          p_venta_codigo: string
          p_venta_id: string
        }
        Returns: boolean
      }
      make_user_admin: { Args: { user_email: string }; Returns: boolean }
      mask_client_data: {
        Args: { client_info: Json; requesting_user_id: string }
        Returns: Json
      }
      migrate_ventas_comprometido_to_reservado: { Args: never; Returns: Json }
      normalize_sucursal_name: {
        Args: { nombre_original: string }
        Returns: {
          master_id: string
          nombre_normalizado: string
        }[]
      }
      preview_stock_corrections: {
        Args: { limit_ventas?: number }
        Returns: {
          bin_sugerido: string
          cantidad: number
          disponibles_actual: number
          documento_tipo: string
          fecha_venta: string
          producto: string
          sku: string
          venta_codigo: string
        }[]
      }
      reassign_during_picking: {
        Args: {
          p_adjusted_by: string
          p_adjusted_by_name: string
          p_detalle_id: string
          p_found_quantity: number
          p_new_bins: Json
          p_original_bin: string
          p_pedido_id: string
          p_sku: string
        }
        Returns: Json
      }
      reassign_order_items: { Args: { order_id: string }; Returns: boolean }
      recover_zombie_session: {
        Args: { p_force_cancel?: boolean; p_session_id: string }
        Returns: Json
      }
      refresh_coverage_mv: { Args: never; Returns: undefined }
      refresh_stock_totals: { Args: never; Returns: undefined }
      refresh_ventas_mensuales_agregadas: { Args: never; Returns: undefined }
      refresh_ventas_mensuales_realmente_agregadas: {
        Args: never
        Returns: undefined
      }
      release_sale_reservation: {
        Args: { sale_id_param: string }
        Returns: Json
      }
      release_stock_reservation: {
        Args: { p_session_id: string }
        Returns: Json
      }
      remove_picking_libre_item: {
        Args: { p_bin_code: string; p_session_id: string; p_sku: string }
        Returns: Json
      }
      reserve_stock_for_session: {
        Args: {
          p_items: Json
          p_session_id: string
          p_user_id: string
          p_user_name: string
        }
        Returns: Json
      }
      restore_lost_stock: {
        Args: { p_bin: string; p_quantity: number; p_sku: string }
        Returns: Json
      }
      safe_move_product_between_bins: {
        Args: {
          destination_bin_code: string
          move_quantity: number
          source_stock_id: string
        }
        Returns: boolean
      }
      safe_update_stock_quantity: {
        Args: { new_disponibles: number; stock_id: string }
        Returns: boolean
      }
      sanitize_audit_logs: { Args: never; Returns: number }
      scan_product_atomic: {
        Args: {
          p_bin_code: string
          p_nombre_producto: string
          p_session_id: string
          p_sku: string
          p_stock_id: string
          p_variante: string
        }
        Returns: undefined
      }
      scan_product_unified: {
        Args: {
          p_bin_code?: string
          p_scanned_code: string
          p_session_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      set_signature_pin: { Args: { p_pin: string }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_bin_inventory:
        | {
            Args: {
              bin_code_param: string
              notes_param?: string
              started_by_name_param: string
              started_by_param: string
            }
            Returns: Json
          }
        | {
            Args: {
              bin_code_param: string
              force_param?: boolean
              notes_param?: string
              started_by_name_param: string
              started_by_param: string
            }
            Returns: Json
          }
      supervisor_cannot_modify_admin: { Args: never; Returns: boolean }
      sync_session_counters_manual: {
        Args: { p_session_id: string }
        Returns: Json
      }
      system_insert_audit_log: {
        Args: {
          p_action: string
          p_details?: Json
          p_ip_address?: string
          p_record_id?: string
          p_table_name?: string
          p_user_agent?: string
          p_user_id: string
        }
        Returns: boolean
      }
      test_item_removal_consistency: {
        Args: never
        Returns: {
          details: string
          passed: boolean
          test_name: string
        }[]
      }
      trigger_shopify_sync: { Args: never; Returns: Json }
      trigger_stock_snapshot: { Args: never; Returns: Json }
      update_bin_name: {
        Args: { new_bin_code: string; old_bin_code: string }
        Returns: undefined
      }
      update_session_with_lock: {
        Args: {
          p_expected_version: number
          p_new_data?: Json
          p_session_id: string
        }
        Returns: {
          error_message: string
          new_version: number
          success: boolean
        }[]
      }
      user_has_permission: {
        Args: { permission_name: string }
        Returns: boolean
      }
      user_has_role: { Args: { check_role: string }; Returns: boolean }
      user_has_signature_pin: { Args: never; Returns: boolean }
      validate_bin_exists: { Args: { p_bin_code: string }; Returns: Json }
      validate_picking_libre_session: {
        Args: {
          p_documento_tipo: string
          p_session_id: string
          p_tienda_id: string
          p_transportista_id?: string
        }
        Returns: Json
      }
      validate_product_available: {
        Args: { p_bin_code: string; p_quantity: number; p_sku: string }
        Returns: Json
      }
      validate_signature_pin: {
        Args: { p_pin: string }
        Returns: {
          is_valid: boolean
          user_email: string
          user_id: string
          user_name: string
        }[]
      }
      validate_stock_before_reservation: {
        Args: { p_session_id: string }
        Returns: {
          error_message: string
          invalid_items: Json
          is_valid: boolean
        }[]
      }
      verify_and_log_committed_stock: {
        Args: { sale_id_param: string }
        Returns: Json
      }
      verify_sale_assignments: {
        Args: { sale_id_param: string }
        Returns: Json
      }
      verify_stock_reserved: { Args: { sale_id_param: string }; Returns: Json }
    }
    Enums: {
      documento_tipo: "factura" | "boleta" | "ticket"
      inventory_status: "iniciado" | "finalizado"
      picking_session_status:
        | "en_proceso"
        | "verificado"
        | "emitiendo"
        | "completado"
        | "cancelado"
        | "error"
      print_job_status: "pendiente" | "en_proceso" | "impreso" | "error"
      print_job_tipo: "documento_bsale" | "firma" | "sticker"
      user_role: "admin" | "vendedora" | "ejecutivo"
      venta_estado:
        | "pendiente"
        | "en_picking"
        | "preparada"
        | "documento_emitido"
        | "despachada"
        | "cancelada"
        | "archivado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      documento_tipo: ["factura", "boleta", "ticket"],
      inventory_status: ["iniciado", "finalizado"],
      picking_session_status: [
        "en_proceso",
        "verificado",
        "emitiendo",
        "completado",
        "cancelado",
        "error",
      ],
      print_job_status: ["pendiente", "en_proceso", "impreso", "error"],
      print_job_tipo: ["documento_bsale", "firma", "sticker"],
      user_role: ["admin", "vendedora", "ejecutivo"],
      venta_estado: [
        "pendiente",
        "en_picking",
        "preparada",
        "documento_emitido",
        "despachada",
        "cancelada",
        "archivado",
      ],
    },
  },
} as const
