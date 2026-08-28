import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ slug: string; z: string; x: string; y: string }>;
};

function tileCoordinate(value: string) {
  return /^\d+$/.test(value) ? Number(value) : null;
}

export async function GET(_request: Request, context: Context) {
  try {
    const { slug, z: rawZ, x: rawX, y: rawY } = await context.params;
    const z = tileCoordinate(rawZ);
    const x = tileCoordinate(rawX);
    const y = tileCoordinate(rawY.replace(/\.mvt$/i, ""));
    if (z === null || x === null || y === null) {
      return NextResponse.json({ error: "Invalid map tile coordinates." }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_company_internal_map_tile", {
      p_company_slug: slug,
      p_z: z,
      p_x: x,
      p_y: y,
    });
    if (error) {
      console.error("Internal map tile RPC failed.", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      const status = error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    const tile = Buffer.from(String(data ?? ""), "base64");
    return new Response(tile, {
      headers: {
        "Content-Type": "application/vnd.mapbox-vector-tile",
        "Cache-Control": "private, max-age=604800, immutable",
        "Content-Length": String(tile.byteLength),
      },
    });
  } catch (error) {
    console.error("Internal map tile route failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal map tile failed." },
      { status: 500 }
    );
  }
}
