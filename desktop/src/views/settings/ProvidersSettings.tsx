import React, { useEffect, useState } from "react";
import type { ParitySettings } from "../../api/parityTypes";
import { providerDefaults, providers } from "../../defaults";
import { native, speechAccount, writingAccount } from "../../native";
import type { AudioInput } from "../../types";
import { keyProviderMismatch } from "./providerKeys";

const box: React.CSSProperties = { background: "var(--os-surface)", border: "1px solid var(--os-line)", borderRadius: 10, padding: 20, display: "flex", flexDirection: "column", gap: 12 };
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 13 };

function ProviderForm({ purpose, settings, onUpdateSettings }: { purpose: "speech" | "writing"; settings: ParitySettings; onUpdateSettings: (settings: ParitySettings) => void }) {
  const providerKey = purpose === "speech" ? "speechProvider" : "languageModelProvider";
  const urlKey = purpose === "speech" ? "speechBaseURL" : "languageModelBaseURL";
  const modelKey = purpose === "speech" ? "speechModel" : "languageModel";
  const [provider, setProvider] = useState(settings[providerKey]);
  const [baseURL, setBaseURL] = useState(settings[urlKey]);
  const [model, setModel] = useState(settings[modelKey]);
  const [secret, setSecret] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const current = { ...settings, [providerKey]: provider, [urlKey]: baseURL.trim(), [modelKey]: model.trim() };
  const account = purpose === "speech" ? speechAccount(current) : writingAccount(current);
  // The other form's saved key can be reused when it points at the same provider and endpoint, as on macOS.
  const otherAccount = purpose === "speech" ? writingAccount(settings) : speechAccount(settings);
  const sameEndpoint = otherAccount.slice(otherAccount.indexOf(":")) === account.slice(account.indexOf(":"));
  const [otherHasKey, setOtherHasKey] = useState(false);
  useEffect(() => { setProvider(settings[providerKey]); setBaseURL(settings[urlKey]); setModel(settings[modelKey]); }, [settings[providerKey], settings[urlKey], settings[modelKey]]);
  useEffect(() => {
    let active = true; setSecret(""); setHasKey(false); setMessage("");
    void native.hasCredential(account).then(value => { if (active) setHasKey(value); }).catch(error => { if (active) setMessage(String(error)); });
    return () => { active = false; };
  }, [account]);
  useEffect(() => {
    let active = true; setOtherHasKey(false);
    if (sameEndpoint) void native.hasCredential(otherAccount).then(value => { if (active) setOtherHasKey(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [otherAccount, sameEndpoint, hasKey]);
  const changeProvider = (id: string) => { const defaults = providerDefaults(id, purpose); setProvider(id); setBaseURL(defaults.baseUrl); setModel(defaults.model); };
  const credential = async (action: "save" | "reuse" | "remove") => {
    const mismatch = action === "save" ? keyProviderMismatch(provider, secret) : null;
    if (mismatch) { setMessage(mismatch); return; }
    setBusy(true); setMessage("");
    try {
      if (action === "remove") await native.removeCredential(account);
      else if (action === "reuse") await native.copyCredential(otherAccount, account);
      else await native.saveCredential(account, secret.trim());
      // The key is stored for the provider shown in the form, so apply that provider too.
      if (action !== "remove") onUpdateSettings(current);
      setSecret(""); setHasKey(action !== "remove"); setMessage(action === "remove" ? "Key removed." : "Key saved in Windows Credential Manager. Provider access is checked when you use it.");
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  };
  return <form className="provider-form" style={box} onSubmit={event => { event.preventDefault(); onUpdateSettings(current); }}>
    <h4 style={{ margin: 0 }}>{purpose === "speech" ? "Speech transcription" : "Writing and cleanup"}</h4>
    <label style={field}>Provider<select value={provider} onChange={event => changeProvider(event.target.value)}>
      {providers.filter(choice => purpose === "speech" ? choice.speechModel : choice.writingModel).map(choice => <option key={choice.id} value={choice.id}>{choice.title}</option>)}
    </select></label>
    <label style={field}>Base URL<input type="url" required value={baseURL} onChange={event => setBaseURL(event.target.value)} /></label>
    <label style={field}>Model<input required value={model} onChange={event => setModel(event.target.value)} /></label>
    <button type="submit">Apply provider settings</button>
    <label style={field}>API key {hasKey ? "· saved" : "· no saved key"}<input type="password" autoComplete="off" value={secret} onChange={event => setSecret(event.target.value)} placeholder="Enter a new key" /></label>
    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" disabled={busy || !secret.trim()} onClick={() => { void credential("save"); }}>Save key</button>
      {!hasKey && otherHasKey && <button type="button" disabled={busy} onClick={() => { void credential("reuse"); }}>{purpose === "speech" ? "Use my saved writing key" : "Use my saved transcription key"}</button>}
      <button type="button" disabled={busy || !hasKey} onClick={() => { void credential("remove"); }}>Remove key</button>
    </div>
    {message && <small role="status">{message}</small>}
  </form>;
}

export function ProvidersSettings({ settings, inputs, onUpdateSettings }: { settings: ParitySettings; inputs: AudioInput[]; onUpdateSettings: (settings: ParitySettings) => void }) {
  const toggle = (key: "meetingMicrophone" | "meetingSystemAudio" | "meetingSummarize" | "meetingLiveTranscription" | "cleanupEnabled" | "saveRawAudio", title: string) => <label style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }} key={key}>{title}<input type="checkbox" checked={settings[key]} onChange={event => onUpdateSettings({ ...settings, [key]: event.target.checked })} /></label>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 650 }}>
    <ProviderForm purpose="speech" settings={settings} onUpdateSettings={onUpdateSettings} />
    <ProviderForm purpose="writing" settings={settings} onUpdateSettings={onUpdateSettings} />
    <div style={box}>
      <h4 style={{ margin: 0 }}>Audio and meeting recording</h4>
      <label style={field}>Microphone<select value={settings.microphoneDeviceUID} onChange={event => onUpdateSettings({ ...settings, microphoneDeviceUID: event.target.value })}>
        <option value="">System default microphone</option>
        {inputs.map(input => <option key={input.id} value={input.id}>{input.name}</option>)}
        {settings.microphoneDeviceUID && !inputs.some(input => input.id === settings.microphoneDeviceUID) && <option value={settings.microphoneDeviceUID}>Unavailable: {settings.microphoneDeviceUID}</option>}
      </select></label>
      {toggle("meetingMicrophone", "Include microphone in meetings")}
      {toggle("meetingSystemAudio", "Include system audio in meetings")}
      {toggle("meetingSummarize", "Summarize meetings on stop")}
      {toggle("meetingLiveTranscription", "Transcribe meeting chunks while recording")}
      {toggle("cleanupEnabled", "Clean up dictated text")}
      {toggle("saveRawAudio", "Keep successful dictation audio")}
      <label style={field}>Writing tone<select value={settings.writingTone} onChange={event => onUpdateSettings({ ...settings, writingTone: event.target.value as ParitySettings["writingTone"] })}><option value="natural">Natural</option><option value="casual">Casual</option><option value="formal">Formal</option></select></label>
      <label style={field}>Cleanup strength<select value={settings.cleanupStrength} onChange={event => onUpdateSettings({ ...settings, cleanupStrength: event.target.value as ParitySettings["cleanupStrength"] })}><option value="light">Light</option><option value="clear">Clear</option><option value="concise">Concise</option></select></label>
    </div>
  </div>;
}
