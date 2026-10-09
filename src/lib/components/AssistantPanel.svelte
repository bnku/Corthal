<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  interface Props {
    activeNotePath: string | null;
    onInsertText?: (text: string) => void;
  }

  let { activeNotePath, onInsertText }: Props = $props();

  let inputMessage = $state("");
  let quickSecretInput = $state("");
  let encryptedResult = $state("");
  let isEncrypting = $state(false);
  let showEncryptTool = $state(false);
  let messages = $state<Array<{ role: "user" | "assistant" | "system"; text: string }>>([
    {
      role: "assistant",
      text: "Привет! Я твой ассистент Cortex. Я могу структурировать мысли, находить заметки и готовить конфигурации. Любые секреты, которые ты введешь как `{{secret:пароль}}`, будут локально зашифрованы твоим SSH-ключом до отправки!",
    },
  ]);

  async function handleQuickEncrypt() {
    if (!quickSecretInput.trim()) return;
    isEncrypting = true;
    try {
      const token = await invoke<string>("crypto_encrypt_secret", {
        plaintext: quickSecretInput,
        pubkeyContent: null,
      });
      encryptedResult = token;
      quickSecretInput = "";
    } catch (err: any) {
      alert("Ошибка шифрования: " + err);
    } finally {
      isEncrypting = false;
    }
  }

  async function handleSendMessage() {
    if (!inputMessage.trim()) return;

    let sanitized = inputMessage;

    // Pre-send interception: match {{secret:...}}
    const secretRegex = /\{\{secret:(.*?)\}\}/g;
    const matches = [...inputMessage.matchAll(secretRegex)];

    if (matches.length > 0) {
      for (const match of matches) {
        const rawPlaintext = match[1];
        try {
          const token = await invoke<string>("crypto_encrypt_secret", {
            plaintext: rawPlaintext,
            pubkeyContent: null,
          });
          sanitized = sanitized.replace(match[0], token);
        } catch (err: any) {
          alert("Не удалось зашифровать секрет: " + err);
          return;
        }
      }
    }

    messages.push({ role: "user", text: sanitized });
    const userPrompt = sanitized;
    inputMessage = "";

    // Simulated local blind-agent response (shows that agent works only with encrypted token)
    setTimeout(() => {
      if (matches.length > 0) {
        messages.push({
          role: "assistant",
          text: `Принято! Я получил данные с зашифрованным токеном SSH Age. Токен сохранен в безопасном виде без доступа к исходному паролю.`,
        });
      } else {
        messages.push({
          role: "assistant",
          text: `Запрос получен. Работаю с открытой заметкой: ${activeNotePath || "нет выбранной заметки"}.`,
        });
      }
    }, 400);
  }
</script>

<div class="assistant-container">
  <div class="header">
    <div class="title">
      <span class="bot-icon">🤖</span>
      <h3>Ассистент</h3>
    </div>
    <button
      class="tool-btn"
      class:active={showEncryptTool}
      onclick={() => (showEncryptTool = !showEncryptTool)}
      title="Инструмент шифрования секретов"
    >
      🔒 Зашифровать
    </button>
  </div>

  {#if showEncryptTool}
    <div class="quick-encrypt-box">
      <div class="box-title">Шифрование через SSH-ключ (`~/.ssh/id_ed25519.pub`)</div>
      <div class="input-row">
        <input
          type="password"
          placeholder="Введите секрет/пароль..."
          bind:value={quickSecretInput}
          onkeydown={(e) => e.key === "Enter" && handleQuickEncrypt()}
        />
        <button onclick={handleQuickEncrypt} disabled={isEncrypting}>
          {isEncrypting ? "..." : "Зашифровать"}
        </button>
      </div>

      {#if encryptedResult}
        <div class="result-box">
          <code>{encryptedResult}</code>
          <div class="result-actions">
            <button onclick={() => navigator.clipboard.writeText(encryptedResult)}>
              📋 Копировать
            </button>
            {#if onInsertText}
              <button onclick={() => onInsertText?.(encryptedResult)}>
                ✍️ Вставить в заметку
              </button>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <div class="messages-area">
    {#each messages as msg}
      <div class="message {msg.role}">
        <div class="bubble">
          {msg.text}
        </div>
      </div>
    {/each}
  </div>

  <div class="input-area">
    <textarea
      placeholder="Напишите задачу... (секреты пишите как {{secret:пароль}})"
      bind:value={inputMessage}
      onkeydown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSendMessage();
        }
      }}
    ></textarea>
    <button class="send-btn" onclick={handleSendMessage} disabled={!inputMessage.trim()}>
      Отправить
    </button>
  </div>
</div>

<style>
  .assistant-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0f172a;
    border-left: 1px solid rgba(148, 163, 184, 0.15);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  }

  .title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .title h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #f1f5f9;
  }

  .tool-btn {
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.35);
    color: #60a5fa;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tool-btn:hover,
  .tool-btn.active {
    background: #3b82f6;
    color: #ffffff;
  }

  .quick-encrypt-box {
    background: #1e293b;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    padding: 12px;
    font-size: 0.8rem;
  }

  .box-title {
    color: #94a3b8;
    margin-bottom: 8px;
    font-size: 0.75rem;
  }

  .input-row {
    display: flex;
    gap: 6px;
  }

  .input-row input {
    flex: 1;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 6px 8px;
    color: #f8fafc;
    font-size: 0.8rem;
  }

  .input-row button {
    background: #22c55e;
    color: #ffffff;
    border: none;
    border-radius: 4px;
    padding: 6px 12px;
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
  }

  .result-box {
    margin-top: 8px;
    background: #0f172a;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  .result-box code {
    display: block;
    word-break: break-all;
    font-size: 0.7rem;
    color: #4ade80;
    margin-bottom: 6px;
    max-height: 60px;
    overflow-y: auto;
  }

  .result-actions {
    display: flex;
    gap: 6px;
  }

  .result-actions button {
    background: #334155;
    color: #e2e8f0;
    border: none;
    border-radius: 3px;
    padding: 3px 8px;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .messages-area {
    flex: 1;
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .message {
    display: flex;
  }

  .message.user {
    justify-content: flex-end;
  }

  .message.assistant {
    justify-content: flex-start;
  }

  .bubble {
    max-width: 85%;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.84rem;
    line-height: 1.4;
    word-break: break-word;
  }

  .user .bubble {
    background: #2563eb;
    color: #ffffff;
    border-bottom-right-radius: 2px;
  }

  .assistant .bubble {
    background: #1e293b;
    color: #e2e8f0;
    border-bottom-left-radius: 2px;
    border: 1px solid rgba(148, 163, 184, 0.1);
  }

  .input-area {
    padding: 12px;
    border-top: 1px solid rgba(148, 163, 184, 0.15);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .input-area textarea {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 8px;
    color: #f8fafc;
    font-size: 0.84rem;
    resize: none;
    height: 65px;
    font-family: inherit;
  }

  .input-area textarea:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .send-btn {
    align-self: flex-end;
    background: #3b82f6;
    color: #ffffff;
    border: none;
    border-radius: 4px;
    padding: 6px 14px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .send-btn:hover:not(:disabled) {
    background: #2563eb;
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
