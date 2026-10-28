const { chamarClaude, chamarGemini, chamarGPT } = require('./provedores-pagos');

const protocolo = process.argv[2];
const historico = [
  {
    role: 'user',
    content:
      `Protocolo do estudo: ${protocolo}\n\n` +
      'Jurisdição regulatória deste estudo: ANVISA.\n\n' +
      'Gere a seção de assentimento do ICF (Termo de Consentimento) para este estudo, se aplicável. ' +
      'Use a ferramenta disponível para buscar a cláusula regulatória correta antes de escrever o texto.',
  },
];

const main = async () => {
  console.log(JSON.stringify(await chamarClaude(historico)));
  console.log(JSON.stringify(await chamarGemini(protocolo)));
  console.log(JSON.stringify(await chamarGPT(historico)));
};

main();
