import SquadOverview from '../SquadOverview';

// todo: remove mock data when integrating with real FPL API
const mockPlayers = [
  { id: 1, name: 'Alisson', position: 'GK', team: 'LIV', price: 5.5, points: 45 },
  { id: 2, name: 'Pickford', position: 'GK', team: 'EVE', price: 4.9, points: 32 },
  { id: 3, name: 'Alexander-Arnold', position: 'DEF', team: 'LIV', price: 7.2, points: 78 },
  { id: 4, name: 'Robertson', position: 'DEF', team: 'LIV', price: 6.8, points: 65 },
  { id: 5, name: 'Walker', position: 'DEF', team: 'MCI', price: 5.4, points: 52 },
  { id: 6, name: 'White', position: 'DEF', team: 'ARS', price: 4.7, points: 43 },
  { id: 7, name: 'Mitchell', position: 'DEF', team: 'CRY', price: 4.2, points: 28 },
  { id: 8, name: 'Salah', position: 'MID', team: 'LIV', price: 12.9, points: 156 },
  { id: 9, name: 'Palmer', position: 'MID', team: 'CHE', price: 10.8, points: 134 },
  { id: 10, name: 'Saka', position: 'MID', team: 'ARS', price: 10.1, points: 98 },
  { id: 11, name: 'Luis Diaz', position: 'MID', team: 'LIV', price: 8.2, points: 76 },
  { id: 12, name: 'Gordon', position: 'MID', team: 'NEW', price: 6.1, points: 54 },
  { id: 13, name: 'Haaland', position: 'FWD', team: 'MCI', price: 14.7, points: 198 },
  { id: 14, name: 'Isak', position: 'FWD', team: 'NEW', price: 8.4, points: 87 },
  { id: 15, name: 'Havertz', position: 'FWD', team: 'ARS', price: 8.1, points: 72 }
];

export default function SquadOverviewExample() {
  const totalValue = mockPlayers.reduce((sum, player) => sum + player.price, 0);
  const totalPoints = mockPlayers.reduce((sum, player) => sum + player.points, 0);
  
  return (
    <SquadOverview 
      players={mockPlayers}
      totalValue={totalValue}
      totalPoints={totalPoints}
      teamName="The Chip Masters"
    />
  );
}