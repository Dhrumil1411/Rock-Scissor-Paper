import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { motion } from 'framer-motion';

// If in dev mode, connect to localhost:4000. In production on Render, connect directly.
const socketUrl = import.meta.env.PROD ? '/' : 'http://localhost:4000';
const socket = io(socketUrl);

function App() {
  const [screen, setScreen] = useState('home'); // home, create, join, game, game_over
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [roomState, setRoomState] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    socket.on('roomCreated', ({ roomId }) => {
      setRoomCode(roomId);
      setScreen('create');
    });

    socket.on('roomJoined', ({ roomId }) => {
      setRoomCode(roomId);
      setScreen('game');
    });

    socket.on('roomState', (state) => {
      setRoomState(state);
      if (state.status === 'playing' || state.status === 'round_reveal') {
        setScreen('game');
      } else if (state.status === 'game_over') {
        setScreen('game_over');
      }
    });

    socket.on('error', (msg) => {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 3000);
      if (msg === 'Opponent disconnected.') {
        setScreen('home');
        setRoomState(null);
        setRoomCode('');
      }
    });

    return () => {
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('roomState');
      socket.off('error');
    };
  }, []);

  const handleCreateRoom = () => {
    if (!name.trim()) return setErrorMsg('Enter a name!');
    socket.emit('createRoom', { name });
  };

  const handleJoinClick = () => {
    if (!name.trim()) return setErrorMsg('Enter a name!');
    setScreen('join');
  };

  const handleJoinRoomSubmit = () => {
    if (!roomCode.trim() || roomCode.length !== 4) return setErrorMsg('Invalid Room Code!');
    socket.emit('joinRoom', { roomId: roomCode, name });
  };

  return (
    <>
      <div className="crt"></div>
      
      {/* Background Marquee */}
      <div className="marquee-container">
        <div className="marquee-content">
          ROCK * PAPER * SCISSORS * NEON BATTLES * PROVE YOUR MIGHT * NEXT ROUND STARTING *
        </div>
      </div>

      <div style={{ marginTop: '80px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h1 className="glitch mb-4" style={{ fontSize: '3rem', textAlign: 'center' }}>
          NEON BATTLES
        </h1>
        {errorMsg && <p className="text-magenta blink" style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>ERROR: {errorMsg}</p>}

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          {screen === 'home' && (
            <div className="flex-col pulse-border">
              <h2 className="text-yellow mb-2">PLAYER INIT</h2>
              <input
                className="arcade-input"
                placeholder="ENTER PLAYER NAME"
                value={name}
                maxLength={10}
                onChange={(e) => setName(e.target.value.toUpperCase())}
              />
              <div className="flex-row">
                <button className="arcade-btn cyan" onClick={handleCreateRoom}>CREATE ROOM</button>
                <button className="arcade-btn magenta" onClick={handleJoinClick}>JOIN ROOM</button>
              </div>
            </div>
          )}

          {screen === 'create' && (
            <div className="flex-col pulse-border">
              <h2 className="text-cyan mb-2">ROOM CREATED</h2>
              <p className="mt-2 mb-2 text-center" style={{ fontSize: '1.5rem'}}>
                ROOM CODE:<br/>
                <span className="text-magenta blink" style={{ fontSize: '3rem', letterSpacing: '5px' }}>{roomCode}</span>
              </p>
              <button 
                className="arcade-btn yellow" 
                onClick={() => navigator.clipboard.writeText(roomCode)}
              >
                COPY CODE
              </button>
              <p className="mt-4 text-cyan blink">WAITING FOR CHALLENGER...</p>
            </div>
          )}

          {screen === 'join' && (
            <div className="flex-col pulse-border">
              <h2 className="text-magenta mb-2">JOIN MATCH</h2>
              <input
                className="arcade-input"
                placeholder="ROOM CODE"
                value={roomCode}
                maxLength={4}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              />
              <div className="flex-row">
                <button className="arcade-btn cyan" onClick={handleJoinRoomSubmit}>CONNECT</button>
                <button className="arcade-btn" onClick={() => setScreen('home')}>BACK</button>
              </div>
            </div>
          )}

          {screen === 'game' && <GameScreen roomState={roomState} myId={socket.id} roomCode={roomCode} />}
          {screen === 'game_over' && <GameOverScreen roomState={roomState} myId={socket.id} onGoHome={() => setScreen('home')} />}
        </motion.div>
      </div>
    </>
  );
}

function GameScreen({ roomState, myId, roomCode }) {
  if (!roomState) return null;

  const playerIds = Object.keys(roomState.players);
  const myPlayer = roomState.players[myId];
  const opponentId = playerIds.find(id => id !== myId);
  const opponent = opponentId ? roomState.players[opponentId] : null;

  const handleChoice = (choice) => {
    socket.emit('makeChoice', { choice });
  };

  // Build Pips
  const renderPips = (score) => {
    return (
      <div className="pips-container">
        {[...Array(3)].map((_, i) => (
          <div key={i} className={`pip ${i < score ? 'win' : 'empty'}`}></div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-col">
      <div className="flex-row" style={{ justifyContent: 'space-between', width: '100%', minWidth: '300px', marginBottom: '10px' }}>
        <div className="text-center">
          <h3 className="text-cyan">{myPlayer?.name || 'YOU'}</h3>
          {renderPips(myPlayer?.score || 0)}
        </div>
        <div className="text-center" style={{ fontSize: '1.5rem', alignSelf: 'center' }}>
          <span className="text-yellow blink">VS</span>
        </div>
        <div className="text-center">
          <h3 className="text-magenta">{opponent?.name || 'OPPONENT'}</h3>
          {renderPips(opponent?.score || 0)}
        </div>
      </div>
      
      <div className="pulse-border" style={{ marginTop: '20px', width: '100%', minHeight: '150px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <h2 className="mb-2">ROUND {roomState.roundCount}</h2>
        
        {roomState.status === 'playing' ? (
          myPlayer?.choice ? (
            <p className="text-cyan blink mt-4" style={{ fontSize: '1.2rem' }}>WAITING FOR OPPONENT...</p>
          ) : (
            <div className="flex-row mt-4 flex-wrap">
              <button className="arcade-btn cyan" onClick={() => handleChoice('rock')}>ROCK</button>
              <button className="arcade-btn magenta" onClick={() => handleChoice('paper')}>PAPER</button>
              <button className="arcade-btn" onClick={() => handleChoice('scissors')}>SCISSORS</button>
            </div>
          )
        ) : roomState.status === 'round_reveal' ? (
          <div className="flex-col mt-4">
             <h3 className="text-yellow glitch">BATTLE REVEAL!</h3>
             <div className="flex-row" style={{ marginTop: '10px'}}>
               <p className="text-cyan" style={{ fontSize: '1.5rem'}}>{myPlayer?.choice?.toUpperCase()}</p>
               <span className="text-yellow" style={{ fontSize: '1.5rem'}}>-</span>
               <p className="text-magenta" style={{ fontSize: '1.5rem'}}>{opponent?.choice?.toUpperCase()}</p>
             </div>
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: '20px', color: 'gray' }}>ROOM: {roomCode}</div>
    </div>
  );
}

function GameOverScreen({ roomState, myId, onGoHome }) {
  if (!roomState) return null;

  const playerIds = Object.keys(roomState.players);
  const myPlayer = roomState.players[myId];
  const opponentId = playerIds.find(id => id !== myId);
  const opponent = opponentId ? roomState.players[opponentId] : null;

  const won = myPlayer?.score === 3;
  const resultText = won ? "VICTORY" : "DEFEAT";
  const resultClass = won ? "text-cyan" : "text-magenta";

  return (
    <div className="flex-col pulse-border">
       <h1 className={`glitch ${resultClass}`} style={{ fontSize: '4rem' }}>{resultText}</h1>
       
       <div className="flex-row mt-4 mb-4" style={{ gap: '40px' }}>
          <div className="text-center">
            <h3 className="text-cyan">{myPlayer?.name}</h3>
            <p style={{ fontSize: '2rem' }}>{myPlayer?.score}</p>
          </div>
          <p className="text-yellow blink" style={{ fontSize: '1.5rem', alignSelf: 'center'}}>-</p>
          <div className="text-center">
            <h3 className="text-magenta">{opponent?.name}</h3>
            <p style={{ fontSize: '2rem' }}>{opponent?.score}</p>
          </div>
       </div>

       {myPlayer?.playAgainVote ? (
         <p className="text-yellow mt-4 blink">WAITING FOR OPPONENT...</p>
       ) : (
         <div className="flex-row mt-4 flex-wrap">
           <button className="arcade-btn cyan" onClick={() => socket.emit('playAgain')}>PLAY AGAIN</button>
           <button className="arcade-btn" onClick={onGoHome}>MAIN MENU</button>
         </div>
       )}
    </div>
  );
}

export default App;
