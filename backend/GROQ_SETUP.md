# GROQ API Setup Guide

## Why Add GROQ?

Adding GROQ as a fallback ensures your Panel Pulse AI system continues working even when:
- Ollama server is down or unreachable
- Network connectivity issues to the Ollama server
- Ollama is being maintained or upgraded

## Quick Setup

### 1. Get Your GROQ API Key

1. Visit https://console.groq.com/
2. Sign up or log in with your account
3. Navigate to the **API Keys** section
4. Click **Create API Key**
5. Copy the key (it looks like: `gsk_...`)

### 2. Add to Your .env File

On your production server, edit the `.env` file:

```bash
# SSH to your production server
ssh user@10.10.142.91

# Navigate to the backend directory
cd /opt/panel-pulse/backend

# Edit the .env file
nano .env
```

Add this line (or uncomment if it exists):

```bash
GROQ_API_KEY=gsk_your_actual_api_key_here
```

**Optional:** Specify the GROQ model (default is fine):

```bash
GROQ_MODEL_NAME=llama-3.3-70b-versatile
```

### 3. Restart the Backend

```bash
pm2 restart panel-pulse-backend
# or
sudo systemctl restart panel-pulse
```

### 4. Verify Fallback is Working

Check the logs to see the startup message:

```bash
pm2 logs panel-pulse-backend
# or
sudo journalctl -u panel-pulse -f
```

You should see:
```
🤖 Primary LLM provider: Ollama (http://10.10.160.51:11434) model=qwen3:latest
   ↳ Automatic fallback available: GROQ
```

## How It Works

1. **Normal Operation:** All requests go to Ollama (data stays on-premises)
2. **Ollama Fails:** System automatically falls back to GROQ
3. **Warning Logged:** You'll see: `⚠️ Primary provider (ollama) failed, using fallback: groq`
4. **Seamless Experience:** Users won't notice any difference

## Priority Order

The system tries providers in this order:

1. **Ollama** (if `OLLAMA_BASE_URL` is set) ← Primary
2. **GROQ** (if `GROQ_API_KEY` is set) ← Fallback
3. **Mistral** (if `MISTRAL_API_KEY` is set) ← Last resort

## Rate Limits

GROQ Free Tier (as of 2024):
- 30 requests per minute
- 14,400 requests per day
- Should be sufficient for most use cases

If you hit rate limits, consider:
- Upgrading to GROQ Pro
- Using Mistral as an additional fallback
- Ensuring Ollama is running reliably

## Testing the Fallback

To test if fallback works:

1. **Stop Ollama temporarily:**
   ```bash
   # On the Ollama server (10.10.160.51)
   sudo systemctl stop ollama
   ```

2. **Run an evaluation** on Panel Pulse AI

3. **Check logs** - you should see the fallback message

4. **Restart Ollama:**
   ```bash
   sudo systemctl start ollama
   ```

## Security Notes

- Keep your GROQ API key secret
- Don't commit it to git
- Use environment variables only
- Rotate keys periodically

## Troubleshooting

### "All LLM providers failed"

**Cause:** Both Ollama and GROQ are unavailable

**Fix:**
- Check Ollama server status
- Verify GROQ API key is valid
- Check network connectivity
- Verify API key hasn't expired

### "GROQ rate limit exceeded"

**Cause:** Too many requests to GROQ

**Fix:**
- Wait a few minutes
- Ensure Ollama is running (so GROQ isn't primary)
- Upgrade GROQ plan if needed

### "Invalid GROQ API key"

**Cause:** API key is incorrect or expired

**Fix:**
- Generate a new key from https://console.groq.com/
- Update `.env` file
- Restart backend

## Questions?

Contact your DevOps team or refer to:
- GROQ Documentation: https://console.groq.com/docs
- Panel Pulse AI Backend README
