const results = {
    message_preprocessor: undefined // simulated skip
};
const trigger = { canonical_text: "/start" };

const val = results.message_preprocessor?.cleaned_text || trigger.canonical_text;
console.log(val);
