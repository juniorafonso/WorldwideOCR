const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Tesseract = require('tesseract.js');
const stringSimilarity = require('string-similarity'); // IMPORTAR A BIBLIOTECA

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ocrparty')
        .setDescription('Analisa uma imagem de party, extrai nomes e compara com a lista de membros.')
        .addAttachmentOption(option =>
            option.setName('imagem')
                .setDescription('A imagem da party para analisar (ex: print da tela da party).')
                .setRequired(true)),
    async execute(interaction) {
        const { GuildMember } = interaction.client.db;
        const imageAttachment = interaction.options.getAttachment('imagem');

        // Lista de nomes reais para comparação (Ground Truth)
        const groundTruthNamesArray = [
            "RoronaoZoro", "CatoSicarious", "TastyCupcakes", "Goshis", "Lastlegion",
            "Sanaa", "Iguro", "fafa02", "xArtemisx", "NurgleEnjoyer", "Woolite",
            "peghy", "Wippa", "MissFortuneMilf", "Crowrage", "LittleGirlSocks",
            "SweetandSpicy", "Qarth", "Drozdzinho", "Marinah"
        ];

        if (!imageAttachment.contentType || !imageAttachment.contentType.startsWith('image/')) {
            return interaction.reply({ content: 'Por favor, envie um arquivo de imagem válido (png, jpg, etc.).', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: false });

        let worker;
        try {
            console.log('[OCR] Criando worker (deve vir pré-carregado)...');
            worker = await Tesseract.createWorker('eng');

            console.log('[OCR] Worker criado.');

            console.log('[OCR] Configurando parâmetros...');
            await worker.setParameters({
                tessedit_enable_doc_dict: '0',
                tessedit_load_system_dawg: '0',
                tessedit_load_freq_dawg: '0',
                tessedit_pageseg_mode: '11', // Mantendo PSM 11
                tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
            });
            console.log('[OCR] Parâmetros configurados.');

            console.log(`[OCR] Processando imagem: ${imageAttachment.url}`);
            const { data: { text } } = await worker.recognize(imageAttachment.url);
            console.log('[OCR] Texto extraído bruto:\n', text);

            const lines = text.split('\n');
            const potentialNames = [];
            const nameRegex = /[a-zA-Z0-9_-]+/g;

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
            const initialOcrNames = [...new Set(potentialNames)];
            console.log('[OCR] Nomes candidatos iniciais (antes do filtro fino):', initialOcrNames);

            const dbMembers = await GuildMember.findAll();
            const dbMemberNamesMap = new Map(dbMembers.map(m => [m.Name.toLowerCase(), m]));

            const finalOcrNames = initialOcrNames.filter(name => {
                const len = name.length;
                const nameLower = name.toLowerCase();

                if (len <= 5 && name === name.toUpperCase() && /^[A-Z]+$/.test(name)) {
                    const knownGoodShortAllCaps = [];
                    if (!knownGoodShortAllCaps.includes(name) && !dbMemberNamesMap.has(nameLower)) {
                        console.log(`[OCR FILTRO FINO] Removendo (curta, todas maiúsculas, não no DB): ${name}`);
                        return false;
                    }
                }

                if (len <= 3 && name === name.toLowerCase() && /^[a-z]+$/.test(name)) {
                    const commonLowercaseNoise = ['eco', 'elo'];
                    if (commonLowercaseNoise.includes(name) && !dbMemberNamesMap.has(nameLower)) {
                        console.log(`[OCR FILTRO FINO] Removendo (curta, minúscula, ruído comum, não no DB): ${name}`);
                        return false;
                    }
                }

                if (len <= 4 && name[0] >= 'a' && name[0] <= 'z' && /[A-Z]/.test(name.substring(1))) {
                    if (!dbMemberNamesMap.has(nameLower)) {
                        console.log(`[OCR FILTRO FINO] Removendo (curta, minúscula inicial com maiúsculas, não no DB): ${name}`);
                        return false;
                    }
                }

                if (len <= 3 && /^[a-zA-Z]+$/.test(name) && (name === name.toUpperCase() || name === name.toLowerCase())) {
                    if (!dbMemberNamesMap.has(nameLower)) {
                        console.log(`[OCR FILTRO FINO] Removendo (muito curta, caso uniforme, puramente alfa, não no DB): ${name}`);
                        return false;
                    }
                }
                // Filtro 5: Lixo de UI específico conhecido
                const specificUiGarbage = ["Clo"];
                if (specificUiGarbage.includes(name) && !dbMemberNamesMap.has(nameLower)) {
                    console.log(`[OCR FILTRO FINO] Removendo (lixo UI específico, não no DB): ${name}`);
                    return false;
                }
                
                return true;
            });
            console.log('[OCR] Nomes finais (após filtro fino):', finalOcrNames);

            if (finalOcrNames.length === 0) {
                return interaction.editReply({ content: 'Não foi possível extrair nomes válidos da imagem após a filtragem. Tente uma imagem mais nítida.' });
            }

            const matchedMembers = [];
            const unmatchedNames = new Set();
            const SIMILARITY_THRESHOLD = 0.54; // Diminuído ligeiramente para garantir a captura de 0.55
            const UI_GARBAGE_PATTERNS = [
                'QEJEY', 'QETJEY', 'QIJEGY', 'QIJEYG', 'QLIO',
                'QLJO', 'QIEY', 'QLJQ', 'QET', 'QEJ', 'QIJ', 'JEY'
            ];

            console.log(`[OCR MATCHING] Iniciando correspondência com limiar de similaridade: ${SIMILARITY_THRESHOLD}`);

            for (const ocrName of finalOcrNames) {
                let originalOcrNameForLog = ocrName;
                let cleanedOcrName = ocrName;

                for (const pattern of UI_GARBAGE_PATTERNS) {
                    cleanedOcrName = cleanedOcrName.split(pattern).join('');
                }
                cleanedOcrName = cleanedOcrName.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();

                if (!cleanedOcrName || cleanedOcrName.length < 3) {
                    console.log(`[OCR CLEANING] Nome OCR "${originalOcrNameForLog}" tornou-se muito curto ou vazio após limpeza: "${cleanedOcrName}". Adicionando original aos não correspondidos.`);
                    unmatchedNames.add(originalOcrNameForLog);
                    continue;
                }
                const logCleanedPart = (originalOcrNameForLog !== cleanedOcrName) ? `(Cleaned: "${cleanedOcrName}")` : "";

                let bestMatch = null;
                let highestSimilarity = 0;
                const ocrNameToCompare = cleanedOcrName.toLowerCase();

                for (const [dbName, dbMember] of dbMemberNamesMap.entries()) {
                    const similarity = stringSimilarity.compareTwoStrings(ocrNameToCompare, dbName);
                    if (similarity > highestSimilarity) {
                        highestSimilarity = similarity;
                        bestMatch = dbMember;
                    }
                }

                if (bestMatch && highestSimilarity >= SIMILARITY_THRESHOLD) {
                    if (!matchedMembers.some(m => m.Id === bestMatch.Id)) {
                        console.log(`[OCR MATCHING] Original OCR: "${originalOcrNameForLog}" ${logCleanedPart} | Melhor correspondência DB: "${bestMatch.Name}" (Similaridade: ${highestSimilarity.toFixed(2)})`);
                        matchedMembers.push(bestMatch);
                    } else {
                        console.log(`[OCR MATCHING] Original OCR: "${originalOcrNameForLog}" ${logCleanedPart} | Melhor correspondência DB: "${bestMatch.Name}" (Similaridade: ${highestSimilarity.toFixed(2)}) - Membro já adicionado.`);
                    }
                } else {
                    console.log(`[OCR MATCHING] Original OCR: "${originalOcrNameForLog}" ${logCleanedPart} | Nenhuma correspondência no DB acima do limiar. Maior similaridade: ${highestSimilarity.toFixed(2)} com "${bestMatch ? bestMatch.Name : 'N/A'}"`);
                    unmatchedNames.add(originalOcrNameForLog);
                }
            }

            const finalMatchedMembers = Array.from(new Set(matchedMembers.map(m => m.Id)))
                                             .map(id => matchedMembers.find(m => m.Id === id));

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Resultado da Análise OCR da Party')
                .setTimestamp();

            if (finalMatchedMembers.length > 0) {
                embed.addFields({ name: `✅ Membros da Party Encontrados na Guilda (${finalMatchedMembers.length})`, value: finalMatchedMembers.map(m => `• ${m.Name}`).join('\n').substring(0, 1020) || 'Nenhum' });
            } else {
                embed.addFields({ name: '✅ Membros da Party Encontrados na Guilda', value: 'Nenhum membro da imagem foi encontrado na lista da guilda.' });
            }

            const finalUnmatchedNamesArray = Array.from(unmatchedNames)
                                                .filter(un => !finalMatchedMembers.some(m => m.Name.toLowerCase() === un.toLowerCase() || stringSimilarity.compareTwoStrings(un.toLowerCase(), m.Name.toLowerCase()) > SIMILARITY_THRESHOLD - 0.1));

            if (finalUnmatchedNamesArray.length > 0) {
                embed.addFields({ name: `❌ Nomes da Party NÃO Encontrados na Guilda (${finalUnmatchedNamesArray.length})`, value: finalUnmatchedNamesArray.map(name => `• ${name}`).join('\n').substring(0, 1020) || 'Nenhum' });
            } else {
                embed.addFields({ name: '❌ Nomes da Party NÃO Encontrados na Guilda', value: 'Todos os nomes extraídos foram encontrados ou não houve nomes não encontrados.' });
            }

            // --- INÍCIO DA COMPARAÇÃO COM GROUND TRUTH PARA O EMBED ---
            const gtFoundInMatched = [];
            const gtNotFoundOrMisidentified = [];
            const groundTruthComparisonThreshold = 0.7; // Limiar para considerar um nome real como "encontrado" em finalMatchedMembers

            for (const gtName of groundTruthNamesArray) {
                let found = false;
                for (const member of finalMatchedMembers) {
                    if (stringSimilarity.compareTwoStrings(gtName.toLowerCase(), member.Name.toLowerCase()) >= groundTruthComparisonThreshold) {
                        gtFoundInMatched.push(`• ${gtName} (como ${member.Name})`);
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    // Tentar encontrar o nome OCR original que mais se assemelha ao gtName
                    let bestOcrCandidateForGt = null;
                    let highestGtSimilarityToOcr = 0;
                    for (const ocrCandidate of [...finalOcrNames, ...initialOcrNames]) { // Checa ambas as listas de OCR
                        const sim = stringSimilarity.compareTwoStrings(gtName.toLowerCase(), ocrCandidate.toLowerCase());
                        if (sim > highestGtSimilarityToOcr) {
                            highestGtSimilarityToOcr = sim;
                            bestOcrCandidateForGt = ocrCandidate;
                        }
                    }
                    if (bestOcrCandidateForGt && highestGtSimilarityToOcr > 0.3) { // Se houver algum candidato OCR minimamente parecido
                         gtNotFoundOrMisidentified.push(`• ${gtName} (OCR viu algo como: "${bestOcrCandidateForGt}", similaridade: ${highestGtSimilarityToOcr.toFixed(2)})`);
                    } else {
                        gtNotFoundOrMisidentified.push(`• ${gtName} (Perdido ou OCR muito diferente)`);
                    }
                }
            }

            let groundTruthComparisonText = `**Comparação com Lista de Referência (${groundTruthNamesArray.length} nomes)**\n`;
            if (gtFoundInMatched.length > 0) {
                groundTruthComparisonText += `✅ Encontrados (${gtFoundInMatched.length}):\n${gtFoundInMatched.join('\n').substring(0, 450)}\n\n`;
            } else {
                groundTruthComparisonText += `✅ Nenhum nome da referência encontrado diretamente.\n\n`;
            }
            if (gtNotFoundOrMisidentified.length > 0) {
                groundTruthComparisonText += `❌ Não Encontrados / Mal Identificados (${gtNotFoundOrMisidentified.length}):\n${gtNotFoundOrMisidentified.join('\n').substring(0, 450)}`;
            } else {
                groundTruthComparisonText += `❌ Todos os nomes da referência parecem ter sido encontrados!`;
            }
            
            embed.addFields({ name: '📋 Análise Detalhada vs Referência', value: groundTruthComparisonText.substring(0,1024) });
            // --- FIM DA COMPARAÇÃO COM GROUND TRUTH ---


            embed.setFooter({ text: `Total de nomes finais após filtragem: ${finalOcrNames.length}` });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[OCR_PARTY_CMD] Erro ao processar OCR:', error);
            if (interaction.deferred || interaction.replied) {
                 await interaction.editReply({ content: 'Ocorreu um erro ao processar a imagem com OCR. Verifique os logs do bot.' });
            } else {
                 await interaction.reply({ content: 'Ocorreu um erro ao processar a imagem com OCR. Verifique os logs do bot.', ephemeral: true });
            }
        } finally {
            if (worker) {
                try {
                    await worker.terminate();
                    console.log('[OCR] Worker finalizado.');
                } catch (termError) {
                    console.error('[OCR] Erro ao finalizar worker:', termError);
                }
            }
        }
    },
};