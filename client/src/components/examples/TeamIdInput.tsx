import TeamIdInput from '../TeamIdInput';

export default function TeamIdInputExample() {
  return (
    <TeamIdInput 
      onAnalyze={(teamId) => console.log('Analyzing team:', teamId)}
      isLoading={false}
    />
  );
}