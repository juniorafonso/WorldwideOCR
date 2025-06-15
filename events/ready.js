const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Bot ${client.user.tag} está online!`);

        console.log('[CACHE WARM-UP] Iniciando busca de membros para todas as guildas...');
        for (const guild of client.guilds.cache.values()) {
            try {
                console.log(`[CACHE WARM-UP] Buscando membros para a guilda: ${guild.name} (${guild.id})`);
                await guild.members.fetch();
                console.log(`[CACHE WARM-UP] Membros buscados com sucesso para: ${guild.name}`);
            } catch (err) {
                if (err.code === 'GuildMembersTimeout') {
                    console.warn(`[CACHE WARM-UP] Timeout ao buscar membros para a guilda: ${guild.name} (${guild.id}). O cache pode estar incompleto para esta guilda.`);
                } else if (err.code === 50001) { // Missing Access
                     console.warn(`[CACHE WARM-UP] Erro 'Missing Access' (50001) ao buscar membros para a guilda: ${guild.name} (${guild.id}). Verifique as permissões do bot e a intenção GuildMembers.`);
                }
                else {
                    console.error(`[CACHE WARM-UP] Erro ao buscar membros para a guilda ${guild.name} (${guild.id}):`, err);
                }
            }
        }
        console.log('[CACHE WARM-UP] Busca inicial de membros concluída.');
    },
};