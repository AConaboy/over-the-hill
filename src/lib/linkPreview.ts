// Apps that fetch a page to build a link preview when someone shares it
// (WhatsApp, iMessage, Messenger, X, Slack, Discord, Telegram and so on).
// When an invite link is pasted into a chat, one of these fetches it: that
// mustn't count as the guest opening their invite, or leave its cookies.

const PREVIEW_AGENTS =
  /whatsapp|facebookexternalhit|facebot|meta-externalagent|twitterbot|slackbot|slack-imgproxy|discordbot|telegrambot|linkedinbot|skypeuripreview|microsoftpreview|teams|pinterest|redditbot|embedly|iframely|applebot|googlebot|bingbot|mastodon|signal|viber|snapchat|bot\b|crawler|spider|preview/i;

export function isLinkPreviewFetch(request: Request): boolean {
  const agent = request.headers.get("user-agent") ?? "";
  return agent === "" || PREVIEW_AGENTS.test(agent);
}
