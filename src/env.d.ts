declare namespace App {
  interface Locals {
    /** The signed-in host's email on admin routes (from the verified
     * Cloudflare Access token), for guests' history. */
    hostEmail?: string;
  }
}
