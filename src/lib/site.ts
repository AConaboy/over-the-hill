// Site-wide details used in more than one place.

export const INSTAGRAM_HANDLE = "overthehill_fest";
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;

/** The message hosts copy from admin and send by WhatsApp, Instagram or
 * anything else, with the guest's own link. */
export function inviteMessage(name: string, link: string): string {
  const firstName = name.trim().split(/\s+/)[0] || "there";
  return `Hi ${firstName}! You're invited to Over the Hill, 13–15 August 2027 at Out to Grass. Here's your personal link to RSVP: ${link}`;
}
