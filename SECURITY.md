# Security Notes

## Secrets

Never commit API keys. Put local keys in `.env`; deployment keys should live in the host's secret manager.

The browser app never receives `OPENAI_KEY`, `OPENAI_MODERATION_KEY`, or `IDEA_LLM_API_KEY`. Those values are read only by the backend process.

Before pushing to GitHub, run:

```bash
npm run secret:scan
npm audit
```

## Recommended `.env`

```env
SKIP_AI=false
IDEA_CHECK=true
IDEA_LLM_API_KEY=
IDEA_LLM_BASE_URL=https://api.deepseek.com
IDEA_LLM_MODEL=deepseek-chat
```

## Deployment

- Keep `.env` out of the repository.
- Rotate any key that was pasted into chat, issue trackers, logs, or screenshots.
- Restrict API keys by provider-side controls when available.
- Set `PUBLIC_APP_URL` to the exact production origin.
- Do not expose the backend directly to arbitrary origins unless you intentionally set `PUBLIC_APP_URL=*`.
