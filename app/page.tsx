'use client';

import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { getWebContainerInstance } from '@/lib/webcontainer-instance';
import type { WebContainer } from '@webcontainer/api';

export default function Home() {
  const [webcontainerInstance, setWebcontainerInstance] = useState<WebContainer | null>(null);
  const [code, setCode] = useState(`import express from 'express';

const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(\`Server is running at http://localhost:\${port}\`);
});`);
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalled, setIsInstalled] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const serverProcessRef = useRef<any>(null);

  useEffect(() => {
    let isSubscribed = true;
    
    const initWebContainer = async () => {
      try {
        setOutput('WebContainerを初期化中...\n');
        const instance = await getWebContainerInstance();
        
        if (isSubscribed) {
          setWebcontainerInstance(instance);
          
          // 初期ファイルをマウント
          const files = {
            'package.json': {
              file: {
                contents: JSON.stringify({
                  name: 'express-app',
                  type: 'module',
                  dependencies: {
                    'express': '^4.18.0',
                    'typescript': '^5.0.0',
                    '@types/express': '^4.17.17',
                    'tsx': '^4.0.0'
                  },
                  scripts: {
                    'start': 'tsx index.ts'
                  }
                }, null, 2)
              }
            },
            'index.ts': {
              file: {
                contents: code
              }
            }
          };
          
          await instance.mount(files);
          
          // 依存関係をインストール
          setOutput(prev => prev + '依存関係をインストール中...\n');
          const installProcess = await instance.spawn('npm', ['install']);
          installProcess.output.pipeTo(new WritableStream({
            write(data) {
              setOutput(prev => prev + data);
            }
          }));
          
          await installProcess.exit;
          
          if (isSubscribed) {
            setOutput(prev => prev + '\n✅ 準備完了！実行ボタンを押してください。\n');
            setIsInstalled(true);
            setIsLoading(false);
          }
          
          // プレビュー用のイベントリスナー設定
          instance.on('server-ready', (port, url) => {
            if (iframeRef.current) {
              iframeRef.current.src = url;
            }
          });
        }
      } catch (error: any) {
        console.error('WebContainer initialization failed:', error);
        if (isSubscribed) {
          setOutput('エラー: WebContainerの初期化に失敗しました。\n' + error);
          setIsLoading(false);
        }
      }
    };
    
    initWebContainer();
    
    return () => {
      isSubscribed = false;
    };
  }, []);

  const runCode = async () => {
    if (!webcontainerInstance || !isInstalled) return;
    
    try {
      // 既存のサーバープロセスを停止
      if (serverProcessRef.current) {
        serverProcessRef.current.kill();
        serverProcessRef.current = null;
      }
      
      setOutput(prev => prev + '\n--- 再実行中 ---\n');
      
      // コードを更新
      await webcontainerInstance.fs.writeFile('/index.ts', code);
      
      // サーバーを起動
      setOutput(prev => prev + 'サーバーを起動中...\n');
      const serverProcess = await webcontainerInstance.spawn('npm', ['start']);
      serverProcessRef.current = serverProcess;
      
      serverProcess.output.pipeTo(new WritableStream({
        write(data) {
          setOutput(prev => prev + data);
        }
      }));
    } catch (error) {
      console.error('Error running code:', error);
      setOutput(prev => prev + '\nエラー: ' + error);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-white shadow-sm p-4">
        <h1 className="text-2xl font-bold text-gray-800">Express TypeScript 学習環境</h1>
      </header>
      
      <main className="flex-1 flex gap-4 p-4">
        <div className="flex-1 flex flex-col gap-4">
          <div className="bg-white rounded-lg shadow p-4 flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">コードエディタ</h2>
              <button 
                onClick={runCode}
                disabled={isLoading || !isInstalled}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
              >
                {isLoading ? '初期化中...' : !isInstalled ? '準備中...' : '実行'}
              </button>
            </div>
            <div className="flex-1 border rounded overflow-hidden">
              <Editor
                height="100%"
                defaultLanguage="typescript"
                value={code}
                onChange={(value) => setCode(value || '')}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14
                }}
              />
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4 h-48">
            <h2 className="text-lg font-semibold mb-2">コンソール出力</h2>
            <pre className="bg-gray-900 text-green-400 p-2 rounded h-32 overflow-auto text-sm">
              {output}
            </pre>
          </div>
        </div>
        
        <div className="w-1/2 bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">プレビュー</h2>
          <iframe
            ref={iframeRef}
            className="w-full h-full border rounded"
            title="Preview"
          />
        </div>
      </main>
    </div>
  );
}