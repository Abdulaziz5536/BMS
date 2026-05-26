const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isSmsConfigured,
  sendSMS
} = require("../services/messaging-service");

const smsEnvKeys = [
  "SMS_API_URL",
  "SMS_API_KEY",
  "SMS_SENDER_ID",
  "SMS_API_KEY_HEADER",
  "SMS_API_KEY_PREFIX",
  "SMS_TO_FIELD",
  "SMS_MESSAGE_FIELD",
  "SMS_SENDER_ID_FIELD",
  "SMS_API_KEY_FIELD",
  "SMS_API_METHOD",
  "SMS_AYMEN_SENDER_ID",
  "SMS_OTHER_SENDER_ID"
];

const withSmsEnv = (t, values) => {
  const previous = Object.fromEntries(smsEnvKeys.map((key) => [key, process.env[key]]));

  for (const key of smsEnvKeys) {
    delete process.env[key];
  }

  Object.assign(process.env, values);

  t.after(() => {
    for (const key of smsEnvKeys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });
};

test("isSmsConfigured accepts one SMS API with a building-specific sender ID", (t) => {
  withSmsEnv(t, {
    SMS_API_URL: "https://sms.example.test/send",
    SMS_API_KEY: "secret",
    SMS_AYMEN_SENDER_ID: "AYMENCC"
  });

  assert.equal(isSmsConfigured(), true);
  assert.equal(isSmsConfigured({ name: "Aymen Commercial Center" }), true);
  assert.equal(isSmsConfigured({ name: "Other Building" }), false);
});

test("sendSMS uses the selected building sender ID with the shared API", async (t) => {
  withSmsEnv(t, {
    SMS_API_URL: "https://sms.example.test/send",
    SMS_API_KEY: "secret",
    SMS_SENDER_ID: "GLOBAL",
    SMS_AYMEN_SENDER_ID: "AYMENCC"
  });

  const previousFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      text: async () => JSON.stringify({ success: true })
    };
  };

  t.after(() => {
    global.fetch = previousFetch;
  });

  const result = await sendSMS("0912345678", "hello", {
    building: { name: "Aymen Commercial Center" }
  });

  assert.equal(result.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://sms.example.test/send");
  assert.equal(calls[0].options.headers.Authorization, "Bearer secret");

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.to, "+251912345678");
  assert.equal(body.message, "hello");
  assert.equal(body.senderId, "AYMENCC");
});
