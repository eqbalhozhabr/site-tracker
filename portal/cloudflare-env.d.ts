declare namespace Cloudflare {
  interface Env {
    SITE_BOOTSTRAP_ADMIN_EMAIL?: string;
    SITE_TIME_ZONE?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
