import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "ir21-pdfs";

// Stores IR.21 PDFs in Supabase Storage rather than local disk — Render and
// Cloud Run both run this API in ephemeral containers, so anything written
// to local disk is lost on the next restart/redeploy/scale-to-zero.
@Injectable()
export class SupabaseStorageService {
  private client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set to use PDF storage");
    }
    this.client = createClient(url, key);
  }

  async upload(storagePath: string, buffer: Buffer): Promise<void> {
    const { error } = await this.client.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (error) {
      throw new InternalServerErrorException(`Failed to store PDF "${storagePath}": ${error.message}`);
    }
  }

  async download(storagePath: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(BUCKET).download(storagePath);
    if (error || !data) {
      throw new InternalServerErrorException(`Failed to fetch PDF "${storagePath}": ${error?.message ?? "not found"}`);
    }
    return Buffer.from(await data.arrayBuffer());
  }
}
