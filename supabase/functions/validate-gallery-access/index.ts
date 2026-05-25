import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

/**
 * validate-gallery-access
 *
 * Validates a share token and returns gallery metadata for client access.
 * Uses the service role key to bypass RLS since clients are unauthenticated.
 *
 * Body: { token: string, password?: string }
 * Returns: { ok: boolean, gallery?: GalleryData, error?: string }
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const { token, password } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_token" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Look up gallery by share token
    const { data: gallery, error } = await supabase
      .from("galleries")
      .select(`
        id,
        photographer_id,
        title,
        client_name,
        require_password,
        password_hash,
        require_download_pin,
        allow_downloads,
        allow_favorites,
        allow_comments,
        download_watermarked,
        expires_at,
        is_active,
        share_token,
        photographers (
          display_name,
          logo_r2_key,
          accent_color
        )
      `)
      .eq("share_token", token)
      .single();

    if (error || !gallery) {
      return new Response(
        JSON.stringify({ ok: false, error: "not_found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!gallery.is_active) {
      return new Response(
        JSON.stringify({ ok: false, error: "gallery_inactive" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (gallery.expires_at && new Date(gallery.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ ok: false, error: "gallery_expired" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // If password required but not provided, tell the client
    if (gallery.require_password && !password) {
      return new Response(
        JSON.stringify({ ok: false, error: "password_required", needsPassword: true }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verify password if provided
    if (gallery.require_password && password) {
      const { data: valid } = await supabase.rpc("verify_gallery_password", {
        p_hash: gallery.password_hash,
        p_password: password,
      });
      if (!valid) {
        return new Response(
          JSON.stringify({ ok: false, error: "password_incorrect", needsPassword: true }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Fetch gallery images
    const { data: images } = await supabase
      .from("gallery_images")
      .select("id, preview_r2_key, original_r2_key, file_name, width, height, sort_order")
      .eq("gallery_id", gallery.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });

    return new Response(
      JSON.stringify({
        ok: true,
        gallery: {
          id: gallery.id,
          photographerId: gallery.photographer_id,
          title: gallery.title,
          clientName: gallery.client_name,
          allowDownloads: gallery.allow_downloads,
          allowFavorites: gallery.allow_favorites,
          allowComments: gallery.allow_comments,
          requireDownloadPin: gallery.require_download_pin,
          downloadWatermarked: gallery.download_watermarked,
          photographer: gallery.photographers,
          images: images || [],
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (err) {
    console.error("validate-gallery-access error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "internal_error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
