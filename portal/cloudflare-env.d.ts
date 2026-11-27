declare namespace Cloudflare {
  interface Env {
    SITE_BOOTSTRAP_ADMIN_EMAIL?: string;
    SITE_TIME_ZONE?: string;
    SITE_APPROVED_INSPECTOR_EMAILS?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
