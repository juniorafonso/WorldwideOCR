const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const stringSimilarity = require('string-similarity');

// O cliente da API Vision será instanciado automaticamente com as credenciais
// da variável de ambiente GOOGLE_APPLICATION_CREDENTIALS
const visionClient = new ImageAnnotatorClient();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('aiocr')
        .setDescription('Analisa uma imagem de party usando Google Cloud Vision AI.')
        .addAttachmentOption(option =>
            option.setName('imagem')
                .setDescription('A imagem da party para analisar.')
                .setRequired(true)),
    async execute(interaction) {
        const { GuildMember } = interaction.client.db; // Assumindo que você tem isso configurado
        const imageAttachment = interaction.options.getAttachment('imagem');

        if (!imageAttachment.contentType || !imageAttachment.contentType.startsWith('image/')) {
            return interaction.reply({ content: 'Por favor, envie um arquivo de imagem válido (png, jpg, etc.).', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            console.log(`[AI OCR] Processando imagem com Google Cloud Vision: ${imageAttachment.url}`);

            // Dica de idioma focada em script latino (usando Inglês como principal)
            const expectedLanguages = ['en']; 

            const request = {
                image: {
                    source: { imageUri: imageAttachment.url }
                },
                imageContext: {
                    languageHints: expectedLanguages
                }
            };

            const [result] = await visionClient.textDetection(request);
            const detections = result.textAnnotations;

            let extractedTextFromAI = "";
            if (detections && detections.length > 0) {
                extractedTextFromAI = detections[0].description;
                console.log('[AI OCR] Texto completo extraído pela IA:\n', extractedTextFromAI);
            } else {
                console.log('[AI OCR] Nenhuma detecção de texto encontrada pela IA.');
                return interaction.editReply('A IA não conseguiu detectar texto na imagem.');
            }

            if (!extractedTextFromAI || extractedTextFromAI.trim() === "") {
                return interaction.editReply('A IA não extraiu nenhum texto da imagem.');
            }

            const lines = extractedTextFromAI.split('\n');
            const potentialNames = [];
            // Regex atualizada para incluir letras Unicode (incluindo cirílico)
            const nameRegex = /[\p{L}\p{N}_-]+/gu; // \p{L} para letras, \p{N} para números, _ e -

            for (const line of lines) {
                const wordsInLine = line.match(nameRegex);
                if (wordsInLine) {
                    for (const word of wordsInLine) {
                        if (word.length >= 3 && word.length <= 24) {
                            if (!/^\d+$/.test(word) || word.length > 1) {
                                potentialNames.push(word);
                            }
                        }
                    }
                }
            }
            const initialAiOcrNames = [...new Set(potentialNames)];
            console.log('[AI OCR] Nomes candidatos iniciais (antes do filtro fino):', initialAiOcrNames);

            const dbMembers = await GuildMember.findAll();
            const dbMemberNamesMap = new Map(dbMembers.map(m => [m.Name.toLowerCase(), m]));

            const uiNoiseTerms = [
                "cluster", "access", "priority", "this", "setting", "determines",
                "who", "gets", "preferred", "overcrowded", "clusters", "party",
                "within", "alliance", "guild", "member", "first", "parties",
                "settings", "leader", "raid", "group", "role", "roles", "name",
                "level", "zone", "map", "channel", "voice", "text", "general",
                "search", "filter", "options", "save", "cancel", "apply", "close",
                "open", "new", "edit", "delete", "confirm", "server", "region",
                "language", "sound", "audio", "video", "display", "graphics",
                "quality", "resolution", "windowed", "fullscreen", "keyboard",
                "mouse", "controller", "gamepad", "keybinds", "hotkeys", "account",
                "profile", "character", "player", "players", "list", "members",
                "invite", "kick", "ban", "promote", "demote", "leave", "join",
                "create", "find", "refresh", "status", "online", "offline", "away",
                "busy", "friends", "friend", "request", "requests", "message",
                "messages", "chat", "whisper", "say", "yell", "emote", "help",
                "support", "report", "feedback", "tutorial", "guide", "tips",
                "news", "updates", "patch", "notes", "version", "credits", "exit",
                "quit", "logout", "login", "username", "password", "email",
                "notifications", "alerts", "inventory", "items", "equipment",
                "skills", "abilities", "spells", "talents", "points", "stats",
                "attributes", "health", "mana", "stamina", "experience", "exp", "xp",
                "currency", "gold", "silver", "copper", "money", "shop", "store",
                "buy", "sell", "trade", "quest", "quests", "journal", "log",
                "completed", "active", "failed", "rewards", "objectives",
                "description", "location", "npc", "monster", "boss", "enemy",
                "enemies", "allies", "neutral", "faction", "reputation","Out Of Zone"
            ];

            const finalAiOcrNames = initialAiOcrNames.filter(name => {
                const lowerName = name.toLowerCase();
                if (lowerName === "eclo" || lowerName === "clo") {
                     console.log(`[AI OCR FILTRO FINO] Removendo lixo comum (eclo/clo): ${name}`);
                     return false;
                }
                if (uiNoiseTerms.includes(lowerName)) {
                    console.log(`[AI OCR FILTRO FINO] Removendo termo de UI conhecido: ${name}`);
                    return false;
                }
                if (name.length < 3 && !dbMemberNamesMap.has(lowerName)) {
                    // console.log(`[AI OCR FILTRO FINO] Removendo nome muito curto não no DB: ${name}`);
                    // return false;
                }
                return true;
            });
            console.log('[AI OCR] Nomes finais (após filtro fino):', finalAiOcrNames);

            if (finalAiOcrNames.length === 0) {
                return interaction.editReply({ content: 'Não foi possível extrair nomes válidos da imagem após a filtragem (IA). Tente uma imagem mais nítida.' });
            }

            const matchedMembersFromDb = []; // Renomeado para clareza
            const unmatchedNames = new Set();
            const SIMILARITY_THRESHOLD = 0.55;

            console.log(`[AI OCR MATCHING] Iniciando correspondência com limiar de similaridade: ${SIMILARITY_THRESHOLD}`);

            for (const ocrName of finalAiOcrNames) {
                let bestMatch = null;
                let highestSimilarity = 0;
                const ocrNameToCompare = ocrName.toLowerCase();

                for (const [dbNameKey, dbMember] of dbMemberNamesMap.entries()) { // dbNameKey é o nome do DB em minúsculas
                    const similarity = stringSimilarity.compareTwoStrings(ocrNameToCompare, dbNameKey);
                    if (similarity > highestSimilarity) {
                        highestSimilarity = similarity;
                        bestMatch = dbMember; // dbMember é o objeto do seu banco de dados
                    }
                }

                if (bestMatch && highestSimilarity >= SIMILARITY_THRESHOLD) {
                    // Evitar duplicatas se o mesmo membro do DB for correspondido por múltiplos nomes OCR
                    if (!matchedMembersFromDb.some(m => m.Id === bestMatch.Id)) {
                        console.log(`[AI OCR MATCHING] Nome IA: "${ocrName}" | Melhor correspondência DB: "${bestMatch.Name}" (Similaridade: ${highestSimilarity.toFixed(2)})`);
                        matchedMembersFromDb.push(bestMatch);
                    }
                } else {
                    unmatchedNames.add(ocrName);
                }
            }

            // Certifique-se de que matchedMembersFromDb contém apenas entradas únicas pelo Id do DB
            const finalMatchedDbMembers = Array.from(new Set(matchedMembersFromDb.map(m => m.Id)))
                                             .map(id => matchedMembersFromDb.find(m => m.Id === id));

            // Construir o Embed de Resposta
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('Resultado da Análise com Google Cloud Vision AI')
                .setTimestamp();

            if (finalMatchedDbMembers.length > 0) {
                // Buscar membros do servidor Discord para adicionar menções
                try {
                    console.log('[AI OCR] Tentando buscar membros da guilda para atualizar o cache...');
                    await interaction.guild.members.fetch(); // Tenta buscar todos os membros
                    console.log('[AI OCR] Cache de membros da guilda potencialmente atualizado.');
                } catch (err) {
                    if (err.code === 'GuildMembersTimeout') {
                        console.warn('[AI OCR] Timeout ao buscar todos os membros da guilda. Prosseguindo com os membros atualmente em cache. As menções podem não estar completas.');
                    } else {
                        // Se for outro erro, relance para ser tratado pelo catch principal do comando
                        console.error('[AI OCR] Erro inesperado ao buscar membros da guilda:', err);
                        // Você pode optar por não relançar se quiser que o comando continue mesmo com outros erros de fetch
                        // throw err; 
                    }
                }

                const displayMatchedMembers = finalMatchedDbMembers.map(dbMember => {
                    const guildMember = interaction.guild.members.cache.find(
                        gm => gm.user.username.toLowerCase() === dbMember.Name.toLowerCase() ||
                              (gm.nickname && gm.nickname.toLowerCase() === dbMember.Name.toLowerCase())
                    );
                    if (guildMember) {
                        return `• ${dbMember.Name} (<@${guildMember.id}>)`;
                    }
                    return `• ${dbMember.Name}`;
                });

                embed.addFields({ name: `✅ Membros da Party Encontrados na Guilda (${finalMatchedDbMembers.length})`, value: displayMatchedMembers.join('\n').substring(0, 1020) || 'Nenhum' });
            } else {
                embed.addFields({ name: '✅ Membros da Party Encontrados na Guilda', value: 'Nenhum membro da imagem foi encontrado na lista da guilda.' });
            }

            const finalUnmatchedNamesArray = Array.from(unmatchedNames)
                                                .filter(un => !finalMatchedDbMembers.some(m => m.Name.toLowerCase() === un.toLowerCase() || stringSimilarity.compareTwoStrings(un.toLowerCase(), m.Name.toLowerCase()) > SIMILARITY_THRESHOLD - 0.1));

            if (finalUnmatchedNamesArray.length > 0) {
                embed.addFields({ name: `❌ Nomes da Party NÃO Encontrados na Guilda (${finalUnmatchedNamesArray.length})`, value: finalUnmatchedNamesArray.map(name => `• ${name}`).join('\n').substring(0, 1020) || 'Nenhum' });
            }

            embed.setFooter({ text: `Total de nomes candidatos da IA (após filtro fino): ${finalAiOcrNames.length}` });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[AI_OCR_CMD] Erro ao processar com Google Cloud Vision:', error);
            if (error.message && (error.message.includes('permission') || error.message.includes('quota'))) {
                 await interaction.editReply({ content: `Erro da API Google Vision: ${error.message}. Verifique as permissões da conta de serviço ou as cotas do projeto.` });
            } else {
                 await interaction.editReply({ content: 'Ocorreu um erro ao processar a imagem com Google Cloud Vision.' });
            }
        }
    },
};