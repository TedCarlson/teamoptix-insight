import { NextResponse } from "next/server";
import { internalMapReferencePack, mapArchiveRange } from "@/features/maps/internalMapReference";
import { readInternalMapArchiveRange } from "@/features/maps/internalMapReference.server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string; pack: string }> };

async function authorizedPack(context: Context) {
  const { slug, pack: rawPack } = await context.params;
  const packKey = rawPack.replace(/\.pmtiles$/i, "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packKey)) {
    return { error: NextResponse.json({ error: "Invalid regional map pack." }, { status: 400 }) };
  }
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_company_internal_map_reference_pack", {
    p_company_slug: slug,
    p_pack_key: packKey,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500;
    return { error: NextResponse.json({ error: error.message }, { status }) };
  }
  const pack = internalMapReferencePack(data);
  if (!pack) return { error: NextResponse.json({ error: "Regional map pack not found." }, { status: 404 }) };
  return { pack };
}

function archiveHeaders(pack: NonNullable<Awaited<ReturnType<typeof authorizedPack>>["pack"]>) {
  return {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=604800, immutable",
    "Content-Type": "application/vnd.pmtiles",
    ETag: `"sha256-${pack.sha256}"`,
  };
}

export async function HEAD(_request: Request, context: Context) {
  try {
    const result = await authorizedPack(context);
    if (result.error) return result.error;
    return new Response(null, {
      headers: { ...archiveHeaders(result.pack), "Content-Length": String(result.pack.byte_length) },
    });
  } catch (error) {
    console.error("Internal map reference HEAD failed.", error);
    return NextResponse.json({ error: "Internal map reference failed." }, { status: 500 });
  }
}

export async function GET(request: Request, context: Context) {
  try {
    const result = await authorizedPack(context);
    if (result.error) return result.error;
    const range = mapArchiveRange(request.headers.get("range"), result.pack.byte_length);
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: {
          ...archiveHeaders(result.pack),
          "Content-Range": `bytes */${result.pack.byte_length}`,
        },
      });
    }
    const bytes = await readInternalMapArchiveRange(result.pack, range);
    const body = new Uint8Array(bytes).buffer;
    return new Response(body, {
      status: 206,
      headers: {
        ...archiveHeaders(result.pack),
        "Content-Length": String(bytes.byteLength),
        "Content-Range": `bytes ${range.start}-${range.end}/${result.pack.byte_length}`,
      },
    });
  } catch (error) {
    console.error("Internal map reference range failed.", error);
    return NextResponse.json({ error: "Internal map reference failed." }, { status: 500 });
  }
}
