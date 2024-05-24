import { Client, GatewayIntentBits, Events, Partials, ButtonBuilder, ActionRowBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, Collection } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource } from '@discordjs/voice';
import { GameConfig, GamePlayer, Cards, Guilds, InitFormAutocompletes, InitFormButtons, WhisperButtons, GameState, GameOverEmbedActions } from './classes.js';
import { createRequire } from 'module';
import url from 'url';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const path = require('node:path');
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { TOKEN, GUILDID, TEXTCHANNELID, VOICECHANNELID } = require('./config.json');

export const devmode = true;

const CLIENT = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildVoiceStates],

	partials: [
		Partials.Message,
		Partials.Channel],
});


let GUILD = null;
let VOICECHANNEL = null;
let TEXTCHANNEL = null;

let gameConfig = null;
let gameState = null;

/**  press play ****/
CLIENT.once(Events.ClientReady, () => { loggedIn(); });
CLIENT.on(Events.Error, console.error);
CLIENT.on(Events.InteractionCreate, interactionInit);

CLIENT.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.cjs'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		// Set a new item in the Collection with the key as the command name and the value as the exported module
		if ('data' in command && 'execute' in command) {
			CLIENT.commands.set(command.data.name, command);
		}
		else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}


CLIENT.login(TOKEN);


function loggedIn() {
	console.log(`Ready to GO! _ ${CLIENT.user.tag}!`);
	GUILD = CLIENT.guilds.cache.get(GUILDID);
	VOICECHANNEL = GUILD.channels.cache.find(channel => channel.id === (devmode ? '437050707972063232' : VOICECHANNELID));
	TEXTCHANNEL = GUILD.channels.cache.find(channel => channel.id === TEXTCHANNELID);
}

async function interactionInit(interaction) {
	// /sueca command
	if (interaction.isChatInputCommand() && interaction.channelId === TEXTCHANNELID && interaction.commandName === 'sueca') {
		const command = interaction.client.commands.get(interaction.commandName);
		await command.execute(interaction).then(_ => { setTimeout(() => { botTriggered(interaction); }, 1000); });
	}

	// autocompletes
	if (interaction.isStringSelectMenu()) {

		// init form autocomplete
		if (Object.values(InitFormAutocompletes).includes(interaction.customId)) {
			initAutocompleteChange(interaction);
		}

		// whisper autocomplete
		switch (interaction.customId) {
			case WhisperButtons.CARDSELECTED:
				cardSelected(interaction);
				break;
		}

	}

	// buttons
	if (interaction.isButton()) {

		// init form buttons
		if (Object.values(InitFormButtons).includes(interaction.customId)) {
			initButtonClick(interaction);
		}

		// whisper button
		switch (interaction.customId) {
			case WhisperButtons.CARDPLAYED:
				cardPlayed(interaction);
				break;
		}

		// 💛 v1 -> Ações pós jogo para continuar jogo
		// 💛 v1 -> Ações para renuncia

	}
}

function initAutocompleteChange(interaction) {
	interaction.deferUpdate();
	const gamePlayer = new GamePlayer();
	gamePlayer.id = interaction.values[0].split('#')[0];
	gamePlayer.name = interaction.values[0].split('#')[1];

	if (interaction.customId === InitFormAutocompletes.DEALER) { gameConfig.dealer = gamePlayer.id; }
	else if (interaction.customId === InitFormAutocompletes.TRUNFO) { gameConfig.trunfo = interaction.values[0]; }
	else { gameConfig.players.set(interaction.customId, gamePlayer); }
}

function initButtonClick(interaction) {
	switch (interaction.customId) {
		case InitFormButtons.CANCEL:
			cancelGameCreation(interaction);
			break;
		case InitFormButtons.NEXT:
			interaction.update(getGameStartForm(1));
			break;
		case InitFormButtons.PREVIOUS:
			interaction.update(getGameStartForm(0));
			break;
		case InitFormButtons.START:
			usersAreReadyToGO(interaction);
			break;
	}

}

function botTriggered(interaction) {
	areThereEnoughPlayers() ? gameIntroduction(interaction) : notEnoughPlayers(interaction);
}


function areThereEnoughPlayers() {
	if (devmode) { return true; }
	return VOICECHANNEL.members.size >= 4;
}


function notEnoughPlayers(interaction) {
	interaction.editReply({ content: 'not enuff players' });
	setTimeout(() => {
		interaction.deleteReply();
	}, 3000);
}

//
function gameIntroduction(interaction) {
	botVoiceIntroduction();
	interaction.editReply(getGameStartForm(0));
	gameConfig = new GameConfig();
}

function botVoiceIntroduction() {
	// bot entra na sala e toca um clip inicial. 💛 v2
}


function getGameStartForm(page) {
	const playersArray = [];
	VOICECHANNEL.members.forEach(member => {
		playersArray.push(new StringSelectMenuOptionBuilder().setLabel(member.displayName).setValue(member.id + '#' + member.displayName));
	});


	if (page === 0) {
		const player1 = new StringSelectMenuBuilder().setCustomId(InitFormAutocompletes.PLAYER1).setPlaceholder('👲 Jogador 1').addOptions(playersArray);
		const player2 = new StringSelectMenuBuilder().setCustomId(InitFormAutocompletes.PLAYER2).setPlaceholder('🤶 Jogador 2').addOptions(playersArray);
		const player3 = new StringSelectMenuBuilder().setCustomId(InitFormAutocompletes.PLAYER3).setPlaceholder('👳‍♂️ Jogador 3').addOptions(playersArray);
		const player4 = new StringSelectMenuBuilder().setCustomId(InitFormAutocompletes.PLAYER4).setPlaceholder('👨‍🦰 Jogador 4').addOptions(playersArray);

		const player1Row = new ActionRowBuilder().addComponents(player1);
		const player2Row = new ActionRowBuilder().addComponents(player2);
		const player3Row = new ActionRowBuilder().addComponents(player3);
		const player4Row = new ActionRowBuilder().addComponents(player4);


		const cancel = new ButtonBuilder().setCustomId(InitFormButtons.CANCEL).setLabel('🚫 Cancelar jogatana').setStyle(ButtonStyle.Danger);
		const next = new ButtonBuilder().setCustomId(InitFormButtons.NEXT).setLabel('⏩ Seguinte').setStyle(ButtonStyle.Primary);

		const buttonsRow = new ActionRowBuilder().addComponents(cancel, next);


		return {
			content: '**Façam as equipas** - 👲👳‍♂️ vs 🤶👨‍🦰 - Jogador 1 e 3 fazem parte da equipa A; Jogador 2 e 4 fazem parte da equipa B.',
			components: [player1Row, player2Row, player3Row, player4Row, buttonsRow],
		};
	}

	if (page === 1) {

		const dealer = new StringSelectMenuBuilder().setCustomId(InitFormAutocompletes.DEALER).setPlaceholder('Quem é que vai baralhar o beat?').addOptions(playersArray);
		const dealerRow = new ActionRowBuilder().addComponents(dealer);

		const trunfo = new StringSelectMenuBuilder().setCustomId(InitFormAutocompletes.TRUNFO).setPlaceholder('O trunfo vem de cima ou baixo?').addOptions([
			new StringSelectMenuOptionBuilder().setValue('up').setLabel('🔼 Cima'),
			new StringSelectMenuOptionBuilder().setValue('down').setLabel('🔽 Baixo'),
		]);
		const trunfoRow = new ActionRowBuilder().addComponents(trunfo);


		const cancel = new ButtonBuilder().setCustomId(InitFormButtons.CANCEL).setLabel('🚫 Cancelar jogatana').setStyle(ButtonStyle.Danger);
		const previous = new ButtonBuilder().setCustomId(InitFormButtons.PREVIOUS).setLabel('⏪ Anterior').setStyle(ButtonStyle.Secondary);
		const start = new ButtonBuilder().setCustomId(InitFormButtons.START).setLabel('🃏 Começar jogo').setStyle(ButtonStyle.Success);

		const buttonsRow = new ActionRowBuilder().addComponents(cancel, previous, start);

		return {
			content: '**Escolhe quem baralha o beat**',
			components: [dealerRow, trunfoRow, buttonsRow],
		};
	}
}


function cancelGameCreation(interaction) {
	interaction.message.delete();
	gameConfig = null;
	botVoiceGoodbye();
}

function botVoiceGoodbye() {
	// toca um audio clip e sai do canal. 💛 v2
}


function usersAreReadyToGO(interaction) {
	isGameConfigValid() ? gameStart(interaction) : gameConfigInvalid(interaction);
}


function isGameConfigValid() {
	if (!gameConfig.dealer || !gameConfig.trunfo) { return false; }
	for (let i = 1; i <= 4; i++) {
		if (!gameConfig.players.get(`player${i}`).id || !gameConfig.players.get(`player${i}`).name) { return false; }
	}
	return true;
}

function gameConfigInvalid(interaction) {
	interaction.update({ content: '**faltam mambos g**' });
}


function gameStart(interaction) {
	botVoiceGameStart();
	let dealerIndex = 0;
	for (let i = 1; i <= 4; i++) {
		if (gameConfig.players.get(`player${i}`).id === gameConfig.dealer) {
			dealerIndex = i;
			break;
		}
	}
	getShuffelingMessage(interaction, dealerIndex);
}

function botVoiceGameStart() {
	// form okay, lets go. dá uma musiquinha de leve tipo jazz. 💛 v2
}

function getShuffelingMessage(interaction, dealerIndex) {
	interaction.update({ content: `O **${gameConfig.players.get(`player${dealerIndex}`).name}** está a baralhar o mambo.`, components: [] });

	setTimeout(() => {
		getCuttingMessage(interaction, dealerIndex);
	}, (devmode ? 1000 : 3000));
}

function getCuttingMessage(interaction, dealerIndex) {
	const playerIndex = (dealerIndex + 2 > 4 ? dealerIndex - 2 : dealerIndex + 2);
	interaction.editReply({ content: `O **${gameConfig.players.get(`player${playerIndex}`).name}** está a cortar o beat.` });

	setTimeout(() => {
		getDrawingMessage(interaction, dealerIndex);
	}, (devmode ? 1000 : 3000));
}

function getDrawingMessage(interaction, dealerIndex) {
	const playerIndex = (dealerIndex + 3 > 4 ? dealerIndex - 1 : dealerIndex + 3);
	interaction.editReply({ content: `O **${gameConfig.players.get(`player${playerIndex}`).name}** está a distribuir o brinde.` });

	setTimeout(() => {
		gameDraw(interaction, dealerIndex);
	}, (devmode ? 1000 : 3000));

}

function gameDraw(interaction, dealerIndex) {
	if (devmode) { console.log('gameDraw'); }
	gameState = new GameState();
	gameState.currentPlayer = dealerIndex;
	gameState.interaction = interaction;
	gameState.gameConfig = gameConfig;
	gameState.setTrunfo();
	timeToPlay();
}


function timeToPlay() {
	if (devmode) { console.log('timeToPlay'); }

	const whosTurnContent = `Está na vez do **${gameConfig.players.get(`player${gameState.currentPlayer}`).name}** jogar.`;
	const trunfoContent = `O trunfo é ${gameState.getNaipeName(gameState.trunfo)}.`;
	const pileContent = `Na mesa temos: ${gameState.getPileText()}`;

	const renunciaButton = [new ButtonBuilder().setCustomId('renuncia').setLabel('🛂 Renuncia!!').setStyle(ButtonStyle.Danger)];
	const buttonsRow = [];

	let content = whosTurnContent + ' ' + trunfoContent;
	if (!!gameState.pile.length) {
		const previouslyTurnContent = `O ${gameConfig.players.get(`player${gameState.currentPlayer - 1 === 0 ? 4 : gameState.currentPlayer - 1}`).name}** jogou ${gameState.getPileText([gameState.pile.at(-1)])}`;
		content = previouslyTurnContent + '\n' + content;
		content += '\n' + pileContent;
	}
	if (!!gameState.previousRound) { content += '\n' + `A equipa ${gameState.previousRound.winningTeam} varreu a ronda anterior, levaram ${gameState.previousRound.score} pontos para o cubico. ` + gameState.getPileText(gameState.previousRound.pile); }

	if (!!gameState.pile.length || !!gameState.previousRound) { buttonsRow.push(new ActionRowBuilder().addComponents(renunciaButton)); };

	gameState.interaction.editReply({ content: content, components: buttonsRow });
	whipserTimeToPlay();
}

function whipserTimeToPlay() {
	if (devmode) { console.log('whipserTimeToPlay'); }
	const userIDtoDM = gameConfig.players.get(`player${gameState.currentPlayer}`).id;

	CLIENT.users.fetch(userIDtoDM).then(user => {
		const form = getCardPlayForm();
		user.send(form);
	});

}

function getCardPlayForm() {
	const cardsArray = [];
	gameState[`player${gameState.currentPlayer}Hand`].forEach(card => {
		let cardLabel = '';

		for (const [key, value] of Object.entries(Cards)) {
			if (card.id !== value) { continue; }
			cardLabel = (key.at(0) + key.slice(1).toLowerCase());
		}

		Object.entries(Guilds).forEach(([key, value]) => {
			if (card.guild !== value) { return; }
			cardLabel += (' de ' + key.at(0) + key.slice(1).toLowerCase());
		});

		if (card.guild === gameState.trunfo) {
			cardLabel += ' 💥';
		}

		if (!!gameState.pile.length && card.guild === gameState.pile[0].guild) {
			cardLabel += ' 🛂';
		}

		cardsArray.push(new StringSelectMenuOptionBuilder().setLabel(cardLabel).setValue(card.guild + '#' + card.id));
	});


	const playerHand = new StringSelectMenuBuilder().setCustomId(WhisperButtons.CARDSELECTED).setPlaceholder('🃏 A Minha mão').addOptions(cardsArray);
	const playerHandRow = new ActionRowBuilder().addComponents(playerHand);


	const go = new ButtonBuilder().setCustomId(WhisperButtons.CARDPLAYED).setLabel('🃏 Jogar carta').setStyle(ButtonStyle.Success);
	const buttonsRow = new ActionRowBuilder().addComponents(go);

	const firstPlayerContent = 'Não existem cartas na mesa.';
	const notFirstPlayerContent = 'Na mesa estão as seguintes cartas: ' + gameState.getPileText();

	return {
		content: `**Escolhe a carta que queres jogar. O trunfo é ${gameState.getNaipeName(gameState.trunfo)}.** - ` + (!!gameState.pile.length ? notFirstPlayerContent : firstPlayerContent) + (devmode ? `és o player numero ${gameState.currentPlayer}` : ''),
		components: [playerHandRow, buttonsRow],
	};
}

function cardSelected(interaction) {
	if (devmode) { console.log('cardSelected'); }
	// 💛 v3 -> atualizar texto do canal com "o user está a pensar"

	gameState.setTempCard(interaction.values[0]);
	interaction.deferUpdate();
}


function cardPlayed(interaction) {
	if (devmode) { console.log('cardPlayed'); }
	interaction.message.delete();
	gameState.nextMove();
	gameState.isRoundOver() ? roundEnded() : timeToPlay();
}

function roundEnded() {
	if (devmode) { console.log('roundEnded'); }
	gameState.checkForRoundWinner();
	gameState.isGameOver() ? gameEnded() : timeToPlay();
}


function gameEnded() {
	if (devmode) { console.log('gameEnded'); }

	const renunciaButton = [new ButtonBuilder().setCustomId('renuncia').setLabel('🛂 Renuncia!!').setStyle(ButtonStyle.Danger)];
	const buttonsRow = [new ActionRowBuilder().addComponents(renunciaButton)];

	let content = `A equipa ${gameState.previousRound.winningTeam} varreu a ronda anterior, levaram ${gameState.previousRound.score} pontos para o cubico. ` + gameState.getPileText(gameState.previousRound.pile);
	content += '**Jogo feito, nada mais.** A calcular o resultado final, sigurem-se...';

	gameState.interaction.editReply({ content: content, components: buttonsRow });
	botVoiceGameEnd();
	gameState.calcTeamScores();

	setTimeout(() => {
		gameEndedScoreboard();
	}, (devmode ? 1000 : 15000));
}

function gameEndedScoreboard() {
	let content = (gameState.gameScore.teamA === gameState.gameScore.teamB)
		? 'Aquele empatezinho técnico, quem nunca'
		: `E o vencedor dessa porra foi a equipa ${gameState.gameScore.teamA > gameState.gameScore.teamB ? 'A' : 'B'}. Parabéns seus caralhos. ${gameState.checkForCapote() ? 'Capote nessa porra, o rabinho deles não aguenta' : ''}`;

	content += `\n**[${gameState.gameScore.teamA}] - [${gameState.gameScore.teamB}]**`;
	gameState.interaction.editReply({ content: content });
}

function botVoiceGameEnd() {
	//  toca uma musiquinha 💛 v2
}

// function getEndGameForm() {
// 	// action buttons
// 	const end = new ButtonBuilder().setCustomId(endGameActions.END).setLabel('Terminar o game').setStyle(ButtonStyle.Success);
// 	const more = new ButtonBuilder().setCustomId(endGameActions.MORE).setLabel('Nova partida').setStyle(ButtonStyle.Primary);
// 	const reset = new ButtonBuilder().setCustomId(endGameActions.RESET).setLabel('Limpar resultados acomulados').setStyle(ButtonStyle.Secondary);

// 	const buttonsRow = new ActionRowBuilder().addComponents(end, more, reset);


// 	return {
// 		content: '**Temos vencedor. É a equipa X seus filhos da puta - Escolhe o queres fazer agora mother fuckers **',
// 		// components: [buttonsRow],
// 	};
// }


// function endGameCloseAction(interaction) {
// 	interaction.message.delete();
// 	gameConfig = null;
// 	gameState = null;
// }


// function newGameRound(reset = false) {
// 	if (reset) { gameState.resetContinousScores(); }
// 	gameState.shuffleNewDeck();
// 	// todo - antes do timetoplay, temnos de settar o currentPlayer d e acordco com o vendcedor do jogo anterior
// 	timeToPlay(true);
// }

