// File: src/components/RotationManager.jsx
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Timer, Plus, Minus, Play, Pause, RotateCcw } from 'lucide-react';

// Helper function to calculate optimal rotation duration
const calculateOptimalRotationDuration = (totalPlayers, playersOnField, periodLength) => {
  const minimumRotationsNeeded = Math.ceil(totalPlayers / playersOnField);
  const optimalDuration = Math.floor(periodLength / minimumRotationsNeeded);
  
  return {
    recommendedDuration: optimalDuration,
    rotationsPerPeriod: minimumRotationsNeeded,
    rotationLengthMinutes: optimalDuration / 60
  };
};

// Utility function for time formatting
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
// Main rotation generation function with skill balancing
const generateRotations = (players, playersOnField, periods, periodLength, overrideRotationDuration = null) => {
  const totalPlayers = players.length;
  const totalGameTime = periods * periodLength;
  
  const optimal = calculateOptimalRotationDuration(totalPlayers, playersOnField, periodLength);
  const rotationDuration = overrideRotationDuration || optimal.recommendedDuration;
  const rotationsPerPeriod = Math.floor(periodLength / rotationDuration);
  
  const rotations = [];
  const playerStats = new Map(players.map(player => [player.name, {
    totalMinutes: 0,
    rotationCount: 0,
    periodsPlayed: new Set(),
    substitutionTimes: []
  }]));
  
  let playerQueue = [...players];
  let currentTime = 0;

  // Helper function to get next balanced group of players
  const getNextPlayers = () => {
    // Sort by playing time to maintain equality
    playerQueue.sort((a, b) => 
      (playerStats.get(a.name).totalMinutes - playerStats.get(b.name).totalMinutes)
    );

    // Calculate ideal skill distribution
    const targetStrongPlayers = Math.ceil(playersOnField / 2);
    
    let selectedPlayers = [];
    let strongCount = 0;
    let weakCount = 0;
    
    // First pass: select players based on play time and skill balance
    for (let i = 0; i < playerQueue.length && selectedPlayers.length < playersOnField; i++) {
      const player = playerQueue[i];
      if (player.skill === 1 && strongCount < targetStrongPlayers) {
        selectedPlayers.push(player);
        strongCount++;
      } else if (player.skill === 0 && weakCount < (playersOnField - targetStrongPlayers)) {
        selectedPlayers.push(player);
        weakCount++;
      }
    }
    
    // Fill remaining spots if needed
    if (selectedPlayers.length < playersOnField) {
      const remainingPlayers = playerQueue
        .filter(p => !selectedPlayers.includes(p))
        .slice(0, playersOnField - selectedPlayers.length);
      selectedPlayers = [...selectedPlayers, ...remainingPlayers];
    }
    
    // Update queue
    playerQueue = [...playerQueue.filter(p => !selectedPlayers.includes(p)), ...selectedPlayers];
    
    return selectedPlayers;
  };

  // Generate rotations for each period
  for (let period = 0; period < periods; period++) {
    const periodRotations = [];
    let remainingPeriodTime = periodLength;
    
    while (remainingPeriodTime > 0) {
      const currentPlayers = getNextPlayers();
      const currentRotationDuration = Math.min(rotationDuration, remainingPeriodTime);
      const rotationStartTime = currentTime + (periodLength - remainingPeriodTime);
      const rotationEndTime = rotationStartTime + currentRotationDuration;
      
      // Update statistics for each player
      currentPlayers.forEach(player => {
        const stats = playerStats.get(player.name);
        stats.totalMinutes += currentRotationDuration;
        stats.rotationCount += 1;
        stats.periodsPlayed.add(period + 1);
        stats.substitutionTimes.push({
          type: 'in',
          time: rotationStartTime,
          period: period + 1,
          rotation: periodRotations.length + 1,
          gameMinute: Math.floor(rotationStartTime / 60)
        });
        stats.substitutionTimes.push({
          type: 'out',
          time: rotationEndTime,
          period: period + 1,
          rotation: periodRotations.length + 1,
          gameMinute: Math.floor(rotationEndTime / 60)
        });
      });
      
      // Record rotation
      periodRotations.push({
        period: period + 1,
        rotationNumber: periodRotations.length + 1,
        players: currentPlayers,
        startTime: rotationStartTime,
        endTime: rotationEndTime,
        durationMinutes: currentRotationDuration / 60,
        gameMinute: Math.floor(rotationStartTime / 60),
        strongCount: currentPlayers.filter(p => p.skill === 1).length,
        weakCount: currentPlayers.filter(p => p.skill === 0).length
      });
      
      remainingPeriodTime -= currentRotationDuration;
    }
    
    rotations.push(periodRotations);
    currentTime += periodLength;
  }

  const targetPlayTimePerPlayer = (playersOnField / totalPlayers) * totalGameTime;
  
  // Calculate final statistics
  const stats = {
    averageMinutes: Array.from(playerStats.values())
      .reduce((acc, stats) => acc + stats.totalMinutes, 0) / totalPlayers / 60,
    targetMinutesPerPlayer: targetPlayTimePerPlayer / 60,
    playerStats: Object.fromEntries(
      Array.from(playerStats.entries()).map(([name, stats]) => [
        name,
        {
          totalMinutes: stats.totalMinutes / 60,
          rotationCount: stats.rotationCount,
          periodsPlayed: Array.from(stats.periodsPlayed),
          substitutionTimes: stats.substitutionTimes,
          percentageOfGame: (stats.totalMinutes / totalGameTime * 100).toFixed(1),
          differenceFromTarget: ((stats.totalMinutes - targetPlayTimePerPlayer) / 60).toFixed(2)
        }
      ])
    ),
    totalRotations: rotations.flat().length,
    rotationDuration: rotationDuration / 60,
    totalGameTime: totalGameTime / 60,
    maxTimeDifference: (Math.max(...Array.from(playerStats.values()).map(s => s.totalMinutes)) -
      Math.min(...Array.from(playerStats.values()).map(s => s.totalMinutes))) / 60,
    rotationsPerPeriod,
    optimal: optimal,
    isUsingOptimalDuration: !overrideRotationDuration,
    minutesPerRotation: rotationDuration / 60
  };
  
  return { rotations, stats };
};
// Main component implementation
const RotationManager = () => {
  // State management - now includes players as objects with skill levels
  const [players, setPlayers] = useState([]);
  const [newPlayer, setNewPlayer] = useState('');
  const [periods, setPeriods] = useState(4);
  const [periodLength, setPeriodLength] = useState(600); // 10 minutes in seconds
  const [playersOnField, setPlayersOnField] = useState(5);
  const [rotationSchedule, setRotationSchedule] = useState(null);
  const [currentPeriod, setCurrentPeriod] = useState(0);
  const [currentRotation, setCurrentRotation] = useState(0);
  const [gameTime, setGameTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rotationDuration, setRotationDuration] = useState(null);
  const [optimalDuration, setOptimalDuration] = useState(null);

  // Timer effect for game management
  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        setGameTime(time => {
          const newTime = time + 1;
          if (rotationSchedule) {
            const allRotations = rotationSchedule.rotations.flat();
            const currentRotationIndex = allRotations.findIndex(
              rot => newTime >= rot.startTime && newTime < rot.endTime
            );
            
            if (currentRotationIndex !== -1) {
              const rotation = allRotations[currentRotationIndex];
              setCurrentPeriod(rotation.period - 1);
              setCurrentRotation(rotation.rotationNumber - 1);
            }
            
            if (newTime >= periods * periodLength) {
              setIsPlaying(false);
              return periods * periodLength;
            }
          }
          return newTime;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, periodLength, periods, rotationSchedule]);

  // Enhanced player management functions
  const addPlayer = () => {
    if (newPlayer.trim() && !players.find(p => p.name === newPlayer.trim())) {
      setPlayers([...players, {
        name: newPlayer.trim(),
        skill: 0 // Default to Second player
      }]);
      setNewPlayer('');
    }
  };

  const handleBulkPlayerAdd = (text) => {
    const newPlayerNames = text
      .split(/[\n,;]+/)
      .map(name => name.trim())
      .filter(name => name.length > 0);
      
    const uniqueNewPlayers = newPlayerNames
      .filter(name => !players.find(p => p.name === name))
      .map(name => ({ 
        name,
        skill: 0 // Default all bulk-added players to Second
      }));
      
    setPlayers([...players, ...uniqueNewPlayers]);
    setNewPlayer('');
  };
  
  const removePlayer = (playerName) => {
    setPlayers(players.filter(p => p.name !== playerName));
  };

  // New function to toggle player skill level
  const togglePlayerSkill = (playerName) => {
    setPlayers(players.map(player => 
      player.name === playerName 
        ? { ...player, skill: player.skill === 1 ? 0 : 1 }
        : player
    ));
  };

  // Function to handle rotation duration changes
  const handleRotationDurationChange = (minutes) => {
    if (!isNaN(minutes) && minutes > 0) {
      setRotationDuration(minutes * 60);
    }
  };
  
  // Generate schedule with enhanced rotation logic
  const generateSchedule = () => {
    if (players.length < playersOnField) {
      alert('Need more players than positions!');
      return;
    }
    const result = generateRotations(players, playersOnField, periods, periodLength, rotationDuration);
    setRotationSchedule(result);
    setOptimalDuration(result.stats.optimal);
    setGameTime(0);
    setCurrentPeriod(0);
    setCurrentRotation(0);
    setIsPlaying(false);
  };
  
  const resetGame = () => {
    setGameTime(0);
    setCurrentPeriod(0);
    setCurrentRotation(0);
    setIsPlaying(false);
  };
  // First section of the render method - Setup Card
return (
  <div className="min-h-screen bg-gray-50 p-8">
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Main Setup Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Player Rotation Manager</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Game Settings */}
            <div className="space-y-4">
              {/* Period Controls */}
              <div>
                <label className="block text-sm font-medium mb-2">Number of Periods</label>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPeriods(p => Math.max(1, p - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center">{periods}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPeriods(p => p + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* Period Length Controls */}
              <div>
                <label className="block text-sm font-medium mb-2">Period Length (minutes)</label>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPeriodLength(p => Math.max(60, p - 60))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center">{periodLength / 60}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPeriodLength(p => p + 60)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* Players on Field Controls */}
              <div>
                <label className="block text-sm font-medium mb-2">Players on Field</label>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPlayersOnField(p => Math.max(1, p - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center">{playersOnField}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPlayersOnField(p => p + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Rotation Duration Controls */}
              <div>
                <label className="block text-sm font-medium mb-2">Rotation Duration (minutes)</label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={rotationDuration ? rotationDuration / 60 : ''}
                      onChange={(e) => handleRotationDurationChange(parseFloat(e.target.value))}
                      placeholder={optimalDuration ? `Optimal: ${optimalDuration.rotationLengthMinutes.toFixed(1)}` : 'Auto'}
                      className="w-24"
                    />
                    <Button
                      variant="outline"
                      onClick={() => setRotationDuration(null)}
                    >
                      Reset to Optimal
                    </Button>
                  </div>
                  {optimalDuration && (
                    <p className="text-sm text-gray-500">
                      Recommended: {optimalDuration.rotationLengthMinutes.toFixed(1)} minutes
                      ({optimalDuration.rotationsPerPeriod} rotations per period)
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Right Column: Player Management */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Add Players</label>
                <div className="space-y-4">
                  {/* Individual Player Addition */}
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Option 1: Add Individual Player (click player to toggle strength)
                    </label>
                    <div className="flex space-x-2">
                      <Input
                        value={newPlayer}
                        onChange={(e) => setNewPlayer(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addPlayer()}
                        placeholder="Enter player name"
                      />
                      <Button onClick={addPlayer}>Add</Button>
                    </div>
                  </div>
                  
                  {/* Bulk Player Addition */}
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Option 2: Paste Player List (separate names with commas, semicolons, or new lines)
                    </label>
                    <div className="space-y-2">
                      <textarea
                        className="w-full h-24 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Example:
John Smith
Jane Doe, Mike Johnson
Sam Wilson; Alex Davis"
                        onChange={(e) => handleBulkPlayerAdd(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Player List Display */}
              <div className="border rounded-lg p-4 max-h-48 overflow-y-auto">
                <div className="space-y-1">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">
                      Current Players ({players.length}) - 
                      First: {players.filter(p => p.skill === 1).length}, 
                      Second: {players.filter(p => p.skill === 0).length}
                    </span>
                    {players.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPlayers([])}
                        className="text-red-600 hover:text-red-700"
                      >
                        Clear All
                      </Button>
                    )}
                  </div>
                  {players.map((player) => (
                    <div key={player.name} className="flex justify-between items-center py-1 px-2 hover:bg-gray-50 rounded">
                      <div className="flex items-center space-x-2">
                        <span>{player.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => togglePlayerSkill(player.name)}
                          className={`${
                            player.skill === 1 
                              ? 'text-green-600 hover:text-green-700' 
                              : 'text-gray-400 hover:text-gray-500'
                          }`}
                        >
                          {player.skill === 1 ? 'First' : 'Second'}
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removePlayer(player.name)}
                        className="text-gray-600 hover:text-red-600"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  {players.length === 0 && (
                    <p className="text-gray-500 text-sm italic">No players added yet</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Generate Schedule Button */}
          <div className="mt-6 flex justify-center">
            <Button
              className="w-full md:w-auto"
              onClick={generateSchedule}
              disabled={players.length < playersOnField}
            >
              Generate Rotation Schedule
            </Button>
          </div>
        </CardContent>
      </Card>
{/* Game Management and Statistics Section - Only shows after schedule generation */}
{rotationSchedule && (
        <>
          {/* Game Management Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Game Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Timer and Control Buttons */}
                <div className="flex justify-center items-center space-x-4">
                  <div className="text-4xl font-bold">
                    <Timer className="inline-block mr-2" />
                    {formatTime(gameTime)}
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setIsPlaying(!isPlaying)}
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={resetGame}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {/* Current Rotation Display */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Current Players */}
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Current Period: {currentPeriod + 1}</h3>
                    <h4 className="text-md font-medium mb-2">Rotation: {currentRotation + 1}</h4>
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h5 className="font-medium mb-2">Current Players on Field:</h5>
                      <ul className="list-disc list-inside">
                        {rotationSchedule.rotations[currentPeriod]?.[currentRotation]?.players.map((player, idx) => (
                          <li key={idx} className={`${
                            player.skill === 1 ? 'text-green-700' : 'text-blue-700'
                          }`}>
                            {player.name} {player.skill === 1 ? '(First)' : '(Second)'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  
                  {/* Current Balance Stats */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold mb-2">Current Team Balance</h3>
                    <div className="space-y-2">
                      <div className="pl-2 space-y-1">
                        <p className="flex justify-between">
                          <span>First Players on Field:</span>
                          <span className="font-semibold">
                            {rotationSchedule.rotations[currentPeriod]?.[currentRotation]?.players.filter(p => p.skill === 1).length}
                          </span>
                        </p>
                        <p className="flex justify-between">
                          <span>Second Players on Field:</span>
                          <span className="font-semibold">
                            {rotationSchedule.rotations[currentPeriod]?.[currentRotation]?.players.filter(p => p.skill === 0).length}
                          </span>
                        </p>
                        <p className="flex justify-between mt-4">
                          <span>Next Rotation In:</span>
                          <span className="font-semibold">
                            {formatTime(
                              rotationSchedule.rotations[currentPeriod]?.[currentRotation]?.endTime - gameTime
                            )}
                          </span>
                        </p>
                      </div>
                    </div>
                    {/* Upcoming Players Preview */}
                    <div className="mt-4 pt-4 border-t">
                      <h4 className="font-medium text-gray-700 mb-2">Next Rotation Players:</h4>
                      {rotationSchedule.rotations[currentPeriod]?.[currentRotation + 1] ? (
                        <ul className="list-disc list-inside text-sm">
                          {rotationSchedule.rotations[currentPeriod][currentRotation + 1].players.map((player, idx) => (
                            <li key={idx} className={player.skill === 1 ? 'text-green-600' : 'text-gray-600'}>
                              {player.name} {player.skill === 1 ? '(First)' : '(Second)'}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500">End of period {currentPeriod + 1}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Complete Rotation Schedule Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Complete Rotation Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="p-2 border text-left">Period</th>
                      <th className="p-2 border text-left">Rotation</th>
                      <th className="p-2 border text-left">Start Time</th>
                      <th className="p-2 border text-left">End Time</th>
                      <th className="p-2 border text-left">Players (First players in green)</th>
                      <th className="p-2 border text-left">Team Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rotationSchedule.rotations.flat().map((rotation, idx) => (
                      <tr 
                        key={idx}
                        className={gameTime >= rotation.startTime && gameTime < rotation.endTime ? 
                          "bg-blue-50" : ""}
                      >
                        <td className="p-2 border">Period {rotation.period}</td>
                        <td className="p-2 border">Rotation {rotation.rotationNumber}</td>
                        <td className="p-2 border">{formatTime(rotation.startTime)}</td>
                        <td className="p-2 border">{formatTime(rotation.endTime)}</td>
                        <td className="p-2 border">
                          {rotation.players.map((player, pidx) => (
                            <span 
                              key={pidx}
                              className={player.skill === 1 ? 'text-green-600' : 'text-gray-600'}
                            >
                              {player.name}{pidx < rotation.players.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </td>
                        <td className="p-2 border">
                          {rotation.strongCount} First, {rotation.weakCount} Second
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Player Statistics Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Player Statistics</CardTitle>
              <p className="text-sm text-gray-500">Target play time: {rotationSchedule.stats.targetMinutesPerPlayer.toFixed(1)} minutes per player</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(rotationSchedule.stats.playerStats)
                  .sort((a, b) => b[1].totalMinutes - a[1].totalMinutes)
                  .map(([playerName, stats]) => {
                    const player = players.find(p => p.name === playerName);
                    return (
                      <div key={playerName} 
                        className={`bg-white p-4 rounded-lg border ${
                          Math.abs(stats.totalMinutes - rotationSchedule.stats.averageMinutes) < 1 
                            ? 'border-green-500' 
                            : 'border-yellow-500'
                        }`}
                      >
                        <h3 className="font-semibold text-lg mb-2 flex items-center justify-between">
                          <span>{playerName}</span>
                          <span className={`text-sm ${
                            player.skill === 1 ? 'text-green-600' : 'text-gray-600'
                          }`}>
                            {player.skill === 1 ? 'First' : 'Second'}
                          </span>
                        </h3>
                        <div className="space-y-1 text-sm">
                          <p className="flex justify-between">
                            <span>Total Play Time:</span>
                            <span className="font-medium">{stats.totalMinutes.toFixed(1)} minutes</span>
                          </p>
                          <p className="flex justify-between">
                            <span>Game Percentage:</span>
                            <span className="font-medium">{stats.percentageOfGame}%</span>
                          </p>
                          <p className="flex justify-between">
                            <span>Rotations:</span>
                            <span className="font-medium">{stats.rotationCount}</span>
                          </p>
                          <p className="flex justify-between">
                            <span>Periods:</span>
                            <span className="font-medium">{stats.periodsPlayed.join(', ')}</span>
                          </p>
                          <p className="flex justify-between text-xs text-gray-500">
                            <span>Difference from Target:</span>
                            <span className={`font-medium ${
                              Math.abs(parseFloat(stats.differenceFromTarget)) < 1 
                                ? 'text-green-600' 
                                : 'text-yellow-600'
                            }`}>
                              {parseFloat(stats.differenceFromTarget) > 0 ? '+' : ''}
                              {stats.differenceFromTarget} min
                            </span>
                          </p>
                        </div>
                        {gameTime > 0 && (
                          <div className="mt-2 pt-2 border-t">
                            <p className="text-xs text-gray-500">
                              Next Change: {
                                stats.substitutionTimes
                                  .find(sub => sub.time > gameTime)
                                  ? `${stats.substitutionTimes.find(sub => sub.time > gameTime).type === 'in' ? 'In' : 'Out'} at ${
                                      formatTime(stats.substitutionTimes.find(sub => sub.time > gameTime).time)
                                    }`
                                  : 'No more changes'
                              }
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  </div>
);
};

export default RotationManager;
