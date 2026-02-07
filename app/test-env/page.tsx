export default function TestPage() {
  // Acest log va apărea DOAR în terminalul de VS Code / CMD, nu în browser!
  console.log("SERVER CHECK:", process.env.AI_API_KEY);

  return <div>Verifică terminalul de unde ai pornit npm run dev!</div>;
}
