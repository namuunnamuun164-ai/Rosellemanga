// Cloudflare R2-руу зураг upload хийх Supabase Edge Function.
//
// ЯАГААД ЭНЭ ХЭРЭГТЭЙ БЭ: R2 бол S3-тэй нийцтэй storage учир upload хийхэд
// Secret Access Key-ээр хүсэлтийг гарын үсэг зурах (sign) шаардлагатай. Энэ
// Secret key-г browser-ийн код (App.jsx) дотор хэзээ ч оруулж болохгүй — тэнд
// байвал хэн ч Network tab-аас хараад bucket-ийг бүхэлд нь устгаж/бичиж чадна.
// Тиймээс upload хүсэлтийг энэ Edge Function-аар дамжуулж, Secret key зөвхөн
// Supabase-ийн (server-талын) орчинд, хэрэглэгчийн browser-т очихгүйгээр хадгална.
//
// Байршуулах (deploy) алхмууд:
//   1) Supabase CLI суулгасан бол:
//        supabase functions deploy upload-to-r2
//   2) Дараах secret-үүдийг тохируулна (Supabase Dashboard → Edge Functions →
//      Manage secrets, эсвэл CLI-аар: supabase secrets set KEY=value):
//        R2_ACCOUNT_ID          = 391ea27992dc6f2b7853fc4ebb3e4f82
//        R2_ACCESS_KEY_ID       = <Cloudflare R2 API token-ы Access Key ID>
//        R2_SECRET_ACCESS_KEY   = <Cloudflare R2 API token-ы Secret Access Key>
//        R2_BUCKET              = rosellemanga
//        R2_PUBLIC_BASE_URL     = https://pub-xxxxxxxx.r2.dev  (эсвэл өөрийн домэйн бэлэн болсны дараа)
//
// Домэйн бэлэн болтол ЭНЭ функцийг deploy хийсэн ч App.jsx-г солихгvй —
// R2_PUBLIC_BASE_URL бэлэн болмогц App.jsx-ийн upload дуудлагуудыг үүн рүү
// чиглүүлнэ.

import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Зөвхөн staff (admin/moderator/editor) upload хийж болох замын угтвар (prefix)-ууд.
// avatars/ бол нэвтэрсэн хэн ч өөрийн зургаа оруулж болно.
const STAFF_ONLY_PREFIXES = ["posters/", "banners/", "chapters/"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Зөвхөн POST дэмжинэ" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Нэвтрээгүй байна" }, 401);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return json({ error: "Нэвтрээгүй байна" }, 401);

    const formData = await req.formData();
    const file = formData.get("file");
    const path = formData.get("path");
    if (!(file instanceof File) || typeof path !== "string" || !path) {
      return json({ error: "file болон path заавал шаардлагатай" }, 400);
    }
    // Path traversal хамгаалалт
    if (path.includes("..") || path.startsWith("/")) {
      return json({ error: "Буруу path" }, 400);
    }

    if (STAFF_ONLY_PREFIXES.some((p) => path.startsWith(p))) {
      const { data: profile } = await supabaseClient
        .from("users")
        .select("roles")
        .eq("id", user.id)
        .single();
      const roles: string[] = profile?.roles || [];
      if (!roles.some((r) => ["admin", "moderator", "editor"].includes(r))) {
        return json({ error: "Энэ үйлдэлд эрх байхгүй байна" }, 403);
      }
    }

    const accountId = Deno.env.get("R2_ACCOUNT_ID")!;
    const bucket = Deno.env.get("R2_BUCKET")!;
    const publicBaseUrl = Deno.env.get("R2_PUBLIC_BASE_URL")!;

    const aws = new AwsClient({
      accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
      secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
      service: "s3",
      region: "auto",
    });

    const objectUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${path}`;
    const bytes = await file.arrayBuffer();
    const putRes = await aws.fetch(objectUrl, {
      method: "PUT",
      body: bytes,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });

    if (!putRes.ok) {
      const text = await putRes.text();
      return json({ error: `R2 upload алдаа: ${text}` }, 502);
    }

    return json({ publicUrl: `${publicBaseUrl}/${path}` });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
