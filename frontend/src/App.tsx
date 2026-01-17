import { useState, useCallback } from 'react';
import {
  BackgroundEffects,
  Header,
  SubtitleDisplay,
  CurrentTranslation,
  Controls,
} from './components';
import { useWebSocket, useAudioRecorder } from './hooks';
import type { ConnectionStatus } from './types';
import './App.css';

function App() {
  const [sourceLanguage, setSourceLanguage] = useState('zh');
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [volume, setVolume] = useState(0);
  const [frequencyData, setFrequencyData] = useState<Uint8Array | null>(null);

  const {
    status: wsStatus,
    currentAsr,
    currentTranslation,
    subtitles,
    connect,
    sendAudio,
    sendStop,
    clearSubtitles,
  } = useWebSocket({ sourceLanguage, targetLanguage });

  const handleVolumeChange = useCallback(
    (vol: number, freqData: Uint8Array) => {
      setVolume(vol);
      setFrequencyData(freqData);
    },
    []
  );

  const {
    isRecording,
    microphones,
    selectedMicrophoneId,
    startRecording,
    stopRecording,
    selectMicrophone,
    refreshMicrophones,
  } = useAudioRecorder({
    onAudioData: sendAudio,
    onVolumeChange: handleVolumeChange,
  });

  // Update app status based on WebSocket and recording state
  const displayStatus: ConnectionStatus = isRecording
    ? 'recording'
    : wsStatus;

  const handleStart = useCallback(async () => {
    try {
      connect();

      // Wait a bit for connection, then start recording
      await new Promise((resolve) => setTimeout(resolve, 500));
      await startRecording();
    } catch (error) {
      console.error('Failed to start:', error);
    }
  }, [connect, startRecording]);

  const handleStop = useCallback(() => {
    stopRecording();
    sendStop();
    setVolume(0);
    setFrequencyData(null);
  }, [stopRecording, sendStop]);

  const handleClear = useCallback(() => {
    clearSubtitles();
  }, [clearSubtitles]);

  const handleSwapLanguages = useCallback(() => {
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
  }, [sourceLanguage, targetLanguage]);

  return (
    <>
      <BackgroundEffects />

      <div className="app-container">
        <Header status={displayStatus} />

        <main className="main-content">
          <SubtitleDisplay
            subtitles={subtitles}
            isEmpty={!isRecording && subtitles.length === 0}
          />

          <CurrentTranslation
            originalText={currentAsr.text}
            translatedText={currentTranslation.text}
            isInterimOriginal={!currentAsr.isFinal && currentAsr.text.length > 0}
            isInterimTranslation={
              !currentTranslation.isFinal && currentTranslation.text.length > 0
            }
          />
        </main>

        <Controls
          isRecording={isRecording}
          microphones={microphones}
          selectedMicrophoneId={selectedMicrophoneId}
          sourceLanguage={sourceLanguage}
          targetLanguage={targetLanguage}
          volume={volume}
          frequencyData={frequencyData}
          onStart={handleStart}
          onStop={handleStop}
          onClear={handleClear}
          onMicrophoneChange={selectMicrophone}
          onRefreshMicrophones={refreshMicrophones}
          onSourceLanguageChange={setSourceLanguage}
          onTargetLanguageChange={setTargetLanguage}
          onSwapLanguages={handleSwapLanguages}
        />
      </div>
    </>
  );
}

export default App;
