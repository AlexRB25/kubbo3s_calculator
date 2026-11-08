import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Colors, Radius } from '@/constants/theme';

/**
 * The 3D tools engine: the same tools as the website (WebAssembly, which React Native cannot run) inside a
 * WebView that is also the 3D preview (turn with one finger, zoom with two). Every control around it is
 * native; this component only sends the engine its jobs and hands back the answers.
 */

/** Built by kubbo3d-tools: node scripts/build-app-engine.mjs */
const ENGINE = require('../../assets/engine/engine.html');

let html: Promise<string> | null = null;
function engineHtml() {
  html ??= (async () => {
    const [asset] = await Asset.loadAsync(ENGINE);
    const uri = asset.localUri ?? asset.uri;
    // In development the asset comes from the bundler (http); in a build it is a local file.
    if (uri.startsWith('http')) return (await fetch(uri)).text();
    return new File(uri).text();
  })().catch((error) => {
    html = null;
    throw error;
  });
  return html;
}

export type ToolEngine = {
  /** Calls a method of the engine (tools, visible, open, stretch, run, export, clear, theme). */
  call: <T = unknown>(method: string, args?: unknown) => Promise<T>;
  /** Sends a picked file to the engine in pieces; returns the address to open it with. */
  send: (uri: string) => Promise<string>;
};

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

/** Base64 per message: big models go in several so no single message is huge. */
const CHUNK = 512 * 1024;

export const ToolEngineView = forwardRef<ToolEngine, { style?: StyleProp<ViewStyle>; onReady?: () => void }>(function ToolEngineView({ style, onReady }, ref) {
  const web = useRef<WebView>(null);
  const pending = useRef(new Map<number, Pending>());
  const next = useRef(1);
  const [source, setSource] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    let current = true;
    engineHtml().then(
      (text) => current && setSource(text),
      () => current && setFailure('No se pudo cargar el motor de herramientas.'),
    );
    return () => {
      current = false;
    };
  }, []);

  // A page that goes away answers nothing: its waiting calls fail instead of hanging.
  useEffect(() => {
    const waiting = pending.current;
    return () => {
      for (const { reject } of waiting.values()) reject(new Error('Se cerró la herramienta.'));
      waiting.clear();
    };
  }, []);

  const inject = useCallback((code: string) => web.current?.injectJavaScript(`${code};true;`), []);

  const call = useCallback(
    <T,>(method: string, args?: unknown) =>
      new Promise<T>((resolve, reject) => {
        const id = next.current++;
        pending.current.set(id, { resolve: resolve as (value: unknown) => void, reject });
        inject(`window.kubbo.call(${id}, ${JSON.stringify(method)}, ${JSON.stringify(args ?? {})})`);
      }),
    [inject],
  );

  const send = useCallback(
    async (uri: string) => {
      const base64 = await new File(uri).base64();
      const token = `${Date.now()}-${next.current++}`;
      for (let at = 0; at < base64.length; at += CHUNK) inject(`window.kubbo.chunk(${JSON.stringify(token)}, ${JSON.stringify(base64.slice(at, at + CHUNK))})`);
      return `chunks:${token}`;
    },
    [inject],
  );

  useImperativeHandle(ref, () => ({ call, send }), [call, send]);

  function onMessage(event: WebViewMessageEvent) {
    let message: { id?: number; ok?: boolean; result?: unknown; error?: string; ready?: boolean };
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.ready !== undefined) {
      if (!message.ready) return setFailure(message.error ?? 'No cargó el motor 3D.');
      setReady(true);
      inject(`window.kubbo.call(0, "theme", ${JSON.stringify({ background: Colors.surfaceRaised, model: Colors.accent })})`);
      onReady?.();
      return;
    }
    const waiting = message.id ? pending.current.get(message.id) : undefined;
    if (!waiting) return;
    pending.current.delete(message.id!);
    if (message.ok) waiting.resolve(message.result);
    else waiting.reject(new Error(message.error || 'No se pudo procesar con estos ajustes.'));
  }

  return (
    <View style={[styles.frame, style]}>
      {source ? (
        <WebView
          ref={web}
          originWhitelist={['*']}
          source={{ html: source, baseUrl: 'file:///' }}
          onMessage={onMessage}
          javaScriptEnabled
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          setSupportMultipleWindows={false}
          style={styles.web}
          // The engine can use a lot of memory with big models; if the system closes it, start it again.
          onContentProcessDidTerminate={() => web.current?.reload()}
          onRenderProcessGone={() => web.current?.reload()}
        />
      ) : null}
      {!ready && (
        <View style={styles.cover}>
          {failure ? <Text style={{ color: Colors.danger, textAlign: 'center', padding: 16 }}>{failure}</Text> : <ActivityIndicator color={Colors.accent} />}
          {!failure && <Text style={{ color: Colors.textSecondary, marginTop: 8 }}>Preparando el motor 3D…</Text>}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { borderRadius: Radius.large, overflow: 'hidden', backgroundColor: '#101315' },
  web: { flex: 1, backgroundColor: 'transparent' },
  cover: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#101315' },
});
