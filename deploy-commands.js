const { REST, Routes } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('node:fs');
const path = require('node:path');

dotenv.config();

const TOKEN = process.env.TOKEN;
const APP_ID = process.env.APP_ID;
// const GUILD_ID = process.env.GUILD_ID; // Descomente e defina no .env para comandos de guilda

if (!TOKEN || !APP_ID) {
    console.error('Erro: TOKEN ou APP_ID não definidos no arquivo .env');
    process.exit(1);
}

const commands = [];
// Pega todos os arquivos de comando da pasta commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Pega a saída SlashCommandBuilder#toJSON() de cada data de comando para deploy
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`[DEPLOY] Comando ${command.data.name} preparado para deploy.`);
    } else {
        console.log(`[AVISO] O comando em ${filePath} está faltando a propriedade "data" ou "execute".`);
    }
}

// Constrói e prepara uma instância do módulo REST
const rest = new REST({ version: '10' }).setToken(TOKEN);

// e faz o deploy dos seus comandos!
(async () => {
    try {
        console.log(`Iniciando a atualização de ${commands.length} comandos de aplicação (/).`);

        // O método put é usado para atualizar completamente todos os comandos na guilda com o conjunto atual
        // Para registrar comandos globalmente:
        const data = await rest.put(
            Routes.applicationCommands(APP_ID),
            { body: commands },
        );

        // Para registrar comandos para uma guilda específica (atualiza mais rápido, bom para desenvolvimento):
        // Se você descomentou GUILD_ID acima, use esta linha em vez da anterior:
        // const data = await rest.put(
        //  Routes.applicationGuildCommands(APP_ID, GUILD_ID),
        //  { body: commands },
        // );

        console.log(`Sucesso ao recarregar ${data.length} comandos de aplicação (/).`);
    } catch (error) {
        // E claro, certifique-se de pegar e logar quaisquer erros!
        console.error(error);
    }
})();