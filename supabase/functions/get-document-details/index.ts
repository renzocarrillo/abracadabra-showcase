import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BSALE_BASE = "https://api.bsale.io/v1";
const BSALE_TOKEN = Deno.env.get('BSALE_ACCESS_TOKEN');

function supabaseClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getDocumentIdFromVentas(orderId: string): Promise<number> {
  const sb = supabaseClient();
  const { data, error } = await sb
    .from("ventas")
    .select("id_bsale_documento")
    .eq("id", orderId)
    .single();

  if (error) throw new Error(error.message);
  const docId = Number(data?.id_bsale_documento);
  if (!docId) throw new Error("id_bsale_documento not found for orderId");
  return docId;
}

async function fetchDetailsPage(documentId: number, offset: number, limit: number) {
  const url = `${BSALE_BASE}/documents/${documentId}/details.json?limit=${limit}&offset=${offset}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "access_token": BSALE_TOKEN,
      "Accept": "application/json"
    }
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(raw || `HTTP ${res.status}`);
  }
  return res.json();
}

type DetailOut = { detailId: number; quantity: number };

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405, 
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    const { orderId } = await req.json().catch(() => ({}));
    if (!orderId) {
      return new Response(JSON.stringify({ error: "orderId is required" }), {
        status: 400, 
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // 1) Obtener documentId desde Supabase (ventas.id_bsale_documento)
    let documentId: number;
    try {
      documentId = await getDocumentIdFromVentas(orderId);
    } catch (e: any) {
      const msg = String(e?.message || e);
      const status = msg.includes("not found") ? 404 : 502;
      const errorResponse = status === 404 
        ? { error: "id_bsale_documento not found for orderId" }
        : { error: "supabase error", raw: msg };
      
      return new Response(JSON.stringify(errorResponse), {
        status, 
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // 2) Paginación Bsale para traer TODOS los detalles
    const limit = 50;
    let offset = 0;
    const all: DetailOut[] = [];

    while (true) {
      const page = await fetchDetailsPage(documentId, offset, limit);
      const items = Array.isArray(page.items) ? page.items : [];
      for (const it of items) {
        all.push({
          detailId: Number(it.id),       // items[].id -> detailId
          quantity: Number(it.quantity)  // items[].quantity -> quantity
        });
      }
      if (items.length < limit) break;
      offset += limit;
    }

    return new Response(JSON.stringify({
      orderId,
      documentId,
      details: all,
      total: all.length
    }), { 
      status: 200, 
      headers: { "Content-Type": "application/json", ...corsHeaders } 
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      error: "Bsale error",
      raw: String(err?.message || err)
    }), { 
      status: 502, 
      headers: { "Content-Type": "application/json", ...corsHeaders } 
    });
  }
});