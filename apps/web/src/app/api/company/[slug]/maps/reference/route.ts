import { NextResponse } from "next/server";
import { internalMapReferencePack } from "@/features/maps/internalMapReference";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_company_internal_map_reference_pack", {
      p_company_slug: slug,
      p_pack_key: null,
    });
    if (error) {
      const status = error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    const pack = internalMapReferencePack(data);
    if (!pack) return NextResponse.json({ error: "Regional map coverage is not assigned." }, { status: 404 });

    const archiveUrl = `/api/company/${encodeURIComponent(slug)}/maps/reference/${encodeURIComponent(pack.pack_key)}.pmtiles`;
    return NextResponse.json({
      pack_key: pack.pack_key,
      coverage_key: pack.coverage_key,
      source_snapshot: pack.source_snapshot,
      schema_version: pack.schema_version,
      byte_length: pack.byte_length,
      sha256: pack.sha256,
      min_zoom: pack.min_zoom,
      max_zoom: pack.max_zoom,
      west: pack.west,
      south: pack.south,
      east: pack.east,
      north: pack.north,
      bounds: [pack.west, pack.south, pack.east, pack.north],
      attribution_html: pack.attribution_html,
      archive_url: archiveUrl,
    }, {
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  } catch (error) {
    console.error("Internal map reference descriptor failed.", error);
    return NextResponse.json({ error: "Internal map reference failed." }, { status: 500 });
  }
}

