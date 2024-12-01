// File: src/components/RotationManager.jsx
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Timer, Plus, Minus, Play, Pause, RotateCcw } from 'lucide-react';

// Helper function to calculate the mathematically optimal rotation duration
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
// Main rotation generation function
const generateRotations = (playerNames, playersOnField, periods, periodLength, overrideRotationDuration = null) => {
  const totalPlayers = playerNames.length;
  const totalGameTime = periods * periodLength;
  
  // Calculate optimal duration but allow for override
  const optimal = calculateOptimalRotationDuration(totalPlayers, playersOnField, periodLength);
  const rotationDuration = overrideRotationDuration || optimal.recommendedDuration;
  
  // Calculate rotations per period based on chosen duration
  const rotationsPerPeriod = Math.floor(periodLength / rotationDuration);
  
  const rotations = [];
  const playerStats = new Map(playerNames.map(name => [name, {
    totalMinutes: 0,
    rotationCount: 0,
    periodsPlayed: new Set(),
    substitutionTimes: []
  }]));
  
  let playerQueue = [...playerNames];
  let currentTime = 0;
  
  const getNextPlayers = () => {
    playerQueue.sort((a, b) => 
      (playerStats.get(a).totalMinutes - playerStats.get(b).totalMinutes)
    );
    const selectedPlayers = playerQueue.slice(0, playersOnField);
    playerQueue = [...playerQueue.slice(playersOnField), ...selectedPlayers];
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
      
      currentPlayers.forEach(player => {
        const stats = playerStats.get(player);
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
      
      periodRotations.push({
        period: period + 1,
        rotationNumber: periodRotations.length + 1,
        players: currentPlayers,
        startTime: rotationStartTime,
        endTime: rotationEndTime,
        durationMinutes: currentRotationDuration / 60,
        gameMinute: Math.floor(rotationStartTime / 60)
      });
      
      remainingPeriodTime -= currentRotationDuration;
    }
    
    rotations.push(periodRotations);
    currentTime += periodLength;
  }

  const targetPlayTimePerPlayer = (playersOnField / totalPlayers) * totalGameTime;
  
  // Calculate comprehensive statistics
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

// The main RotationManager component that handles all game management
const RotationManager = () => {
  // State management for all our game parameters and settings
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

  // Timer effect for managing game time and rotation updates
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

  // Player management functions
  const addPlayer = () => {
    if (newPlayer.trim() && !players.includes(newPlayer.trim())) {
      setPlayers([...players, newPlayer.trim()]);
      setNewPlayer('');
    }
  };

  const handleBulkPlayerAdd = (text) => {
    const newPlayers = text
      .split(/[\n,;]+/)
      .map(name => name.trim())
      .filter(name => name.length > 0);
      
    const uniqueNewPlayers = [...new Set(newPlayers)]
      .filter(player => !players.includes(player));
      
    setPlayers([...players, ...uniqueNewPlayers]);
    setNewPlayer('');
  };
  
  const removePlayer = (playerToRemove) => {
    setPlayers(players.filter(player => player !== playerToRemove));
  };

  // Handle rotation duration changes
  const handleRotationDurationChange = (minutes) => {
    if (!isNaN(minutes) && minutes > 0) {
      setRotationDuration(minutes * 60); // Convert minutes to seconds
    }
  };
  
  // Main function to generate the game schedule
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
  
  // Game control functions
  const resetGame = () => {
    setGameTime(0);
    setCurrentPeriod(0);
    setCurrentRotation(0);
    setIsPlaying(false);
  };

  // The component's render method
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Setup Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Player Rotation Manager</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Game Settings Controls */}
              <div className="space-y-4">
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

              {/* Player Management Section */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Add Players</label>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Option 1: Add Individual Player</label>
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
                
                <div className="border rounded-lg p-4 max-h-48 overflow-y-auto">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">Current Players ({players.length})</span>
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
                      <div key={player} className="flex justify-between items-center py-1 px-2 hover:bg-gray-50 rounded">
                        <span>{player}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePlayer(player)}
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

        {/* Game Management and Statistics Section */}
        {rotationSchedule && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold">Game Management</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
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
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Current Period: {currentPeriod + 1}</h3>
                      <h4 className="text-md font-medium mb-2">Rotation: {currentRotation + 1}</h4>
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <h5 className="font-medium mb-2">Current Players on Field:</h5>
                        <ul className="list-disc list-inside">
                          {rotationSchedule.rotations[currentPeriod]?.[currentRotation]?.players.map((player, idx) => (
                            <li key={idx} className="text-blue-700">{player}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold mb-2">Team and Rotation Statistics</h3>
                      <div className="space-y-2">
                        <h4 className="font-medium text-gray-700">Game Information</h4>
                        <div className="pl-2 space-y-1">
                          <p className="flex justify-between">
                            <span>Total Players:</span>
                            <span className="font-semibold">{players.length}</span>
                          </p>
                          <p className="flex justify-between">
                            <span>Players on Field:</span>
                            <span className="font-semibold">{playersOnField}</span>
                          </p>
                          <p className="flex justify-between">
                            <span>Rotation Duration:</span>
                            <span className="font-semibold">
                              {rotationSchedule.stats.rotationDuration.toFixed(1)} min
                              {!rotationSchedule.stats.isUsingOptimalDuration && " (Custom)"}
                            </span>
                          </p>
                          <p className="flex justify-between">
                            <span>Max Time Difference:</span>
                            <span className="font-semibold">
                              {rotationSchedule.stats.maxTimeDifference.toFixed(1)} min
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Complete Rotation Schedule */}
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
                        <th className="p-2 border text-left">Players</th>
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
                          <td className="p-2 border">{rotation.players.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Individual Player Statistics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold">Player Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(rotationSchedule.stats.playerStats)
                    .sort((a, b) => b[1].totalMinutes - a[1].totalMinutes)
                    .map(([player, stats]) => (
                      <div key={player} 
                        className={`bg-white p-4 rounded-lg border ${
                          Math.abs(stats.totalMinutes - rotationSchedule.stats.averageMinutes) < 1 
                            ? 'border-green-500' 
                            : 'border-yellow-500'
                        }`}>
                        <h3 className="font-semibold text-lg mb-2">{player}</h3>
                        <div className="space-y-1 text-sm">
                          <p className="flex justify-between">
                            <span>Total Play Time:</span>
                            <span className="font-medium">{stats.totalMinutes.toFixed(1)} minutes</span>
                          </p>
                          <p className="flex justify-between">
                            <span>Percentage of Game:</span>
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
                    ))}
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