const webhook = {
    event_kind: "message",
    text: "/start"
};

// Logic from telegram_webhook_trigger.py (simplified)
let text_kind = "plain_text";
if (webhook.text.startsWith("/")) {
    text_kind = "command_start"; // Or "command"
}

console.log("text_kind:", text_kind);
console.log("Should skip?", text_kind !== "plain_text");
