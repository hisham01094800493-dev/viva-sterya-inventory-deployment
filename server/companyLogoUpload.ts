import { upsertSetting } from "./db";
import { storagePut } from "./storage";

type CompanyLogoInput = { fileName: string; contentType: "image/jpeg" | "image/png" | "image/webp"; dataBase64: string };
type CompanyLogoDeps = { put: typeof storagePut; save: typeof upsertSetting };

export async function uploadCompanyLogo(input: CompanyLogoInput, deps: CompanyLogoDeps = { put: storagePut, save: upsertSetting }) {
  const raw = input.dataBase64.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error("حجم الشعار يجب ألا يتجاوز 5 ميجابايت");
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uploaded = await deps.put(`company/logo/${safeName}`, buffer, input.contentType);
  await deps.save({ key: "company_logo_url", value: uploaded.url, description: "رابط شعار الشركة المستخدم في تقارير PDF" });
  return { url: uploaded.url, key: uploaded.key };
}
