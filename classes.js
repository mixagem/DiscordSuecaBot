const twoCardsDeck = false;
const fourCardsDeck = false;

export class GameConfig {
	players;
	dealer;
	constructor() {
		this.players = new Map();
		this.dealer = '';
	};
}

export class GamePlayer {
	name;
	id;
	constructor() {
		this.id = '';
		this.name = '';
	}
}

export class GameCard {
	guild;
	id;
	constructor() {
		this.guild = '';
		this.id = 0;
	};
}

export class GameRound {
	winnerIndex;
	winningTeam;
	pile;
	score;
	constructor() {
		this.winnerIndex = 0;
		this.winningTeam = '';
		this.pile = [];
		this.score = 0;

	}
}

export const Guilds = {
	'OUROS': 'diamonds',
	'PAUS': 'clubs',
	'ESPADAS': 'spades',
	'COPAS': 'hearts',
};

export const Cards = twoCardsDeck
	? { 'ÁS': 1, 'MANILHA': 7 }
	: fourCardsDeck
		? { 'ÁS': 1, 'MANILHA': 7, 'VALETE': 11, 'REI': 13 }
		: {
			'ÁS': 1,
			'DOIS': 2,
			'TRÊS': 3,
			'QUATRO': 4,
			'CINCO': 5,
			'SEIS': 6,
			'MANILHA': 7,
			'VALETE': 11,
			'DAMA': 12,
			'REI': 13,
		};

export const Teams = {
	'A': 'A',
	'B': 'B',
};

export const InitFormButtons = {
	'NEXT': 'next',
	'PREVIOUS': 'prev',
	'CANCEL': 'cancel',
	'START': 'start',
};

export const InitFormAutocompletes = {
	'PLAYER1': 'player1',
	'PLAYER2': 'player2',
	'PLAYER3': 'player3',
	'PLAYER4': 'player4',
	'DEALER': 'dealer',
	'TRUNFO': 'trunfo',
};

export const WhisperButtons = {
	'CARDPLAYED': 'cardPlayed',
	'CARDSELECTED': 'cardSelected',
};

export const GameOverEmbedActions = {
	'END': 'endGame',
	'MORE': 'nextGame',
	'RESET': 'resetAcomulated',
};

export const RenunciaActions = {
	'TRIGGER': 'renuncia_trigger',
	'TARGET': 'renuncia_targetchanged',
	'CONFIRM': 'renuncia_confirmation',
	'CANCEL': 'renuncia_cancel',
};

export const CardScores = new Map();
if (!twoCardsDeck && !fourCardsDeck) {
	CardScores.set(Cards.DOIS, 0.2);
	CardScores.set(Cards.TRÊS, 0.3);
	CardScores.set(Cards.QUATRO, 0.4);
	CardScores.set(Cards.CINCO, 0.5);
	CardScores.set(Cards.SEIS, 0.6);
	CardScores.set(Cards.DAMA, 2);
}
if ((fourCardsDeck && !twoCardsDeck) || (!twoCardsDeck && !fourCardsDeck)) {
	CardScores.set(Cards.VALETE, 3);
	CardScores.set(Cards.REI, 4);
}
CardScores.set(Cards.MANILHA, 10);
CardScores.set(Cards.ÁS, 11);

// min 0, max = size - 1
function randomPick(size) { return Math.floor(Math.random() * size); };

export class GameState {
	pile;
	player1Hand;
	player2Hand;
	player3Hand;
	player4Hand;
	teamAScorePile;
	teamBScorePile;
	trunfo;
	renunciasLog;
	currentPlayer;
	gameScore;
	continuousScore;
	interaction;
	gameConfig;
	tempCard;
	previousRound;
	renunciasMap;
	renunciaTrigger;
	renunciaRound;

	constructor() {
		this.shuffleNewDeck();
		this.continuousScore = { teamA: 0, teamB: 0 };
		this.interaction = null;
		this.gameConfig = null;
	};

	shuffleNewDeck() {
		this.pile = [];
		this.teamAScorePile = [];
		this.teamBScorePile = [];
		this.player1Hand = [];
		this.player2Hand = [];
		this.player3Hand = [];
		this.player4Hand = [];
		this.trunfo = '';
		this.renunciasLog = [];
		this.currentPlayer = 1;
		this.gameScore = { teamA: 0, teamB: 0 };
		this.tempCard = null;
		this.previousRound = null;
		this.renunciasMap = new Map();
		this.renunciaTrigger = '';
		this.renunciaRound = 0;

		Object.values(Guilds).forEach(guild => {
			Object.values(Cards).forEach(id => {
				this.pile.push({ guild: guild, id: id });
			});
		});

		while (!!this.pile.length) {
			const rng = randomPick(this.pile.length);
			const cardDrawn = this.pile[rng];
			const newPile = [...this.pile.slice(0, rng), ...this.pile.slice(rng + 1)];
			this.pile = newPile;

			switch (this.pile.length % 4) {
				case 0:
					this.player1Hand.push(cardDrawn);
					break;
				case 1:
					this.player2Hand.push(cardDrawn);
					break;
				case 2:
					this.player3Hand.push(cardDrawn);
					break;
				case 3:
					this.player4Hand.push(cardDrawn);
					break;
			}
		}
	}

	// 4 nest loops, oh dear.
	// that beeing said, it is capped at (worst case scenario) 4x4x10xY interactions.
	// 4 hands to order, 4 card guilds to order by, 10 cards each hands, and then <0-9> cards to go throu in order to get a guild/value ordered hand
	sortHands() {
		// players' loop
		for (let i = 1; i <= 4; i++) {
			const sortedHand = [];
			// getting ordered by value cards from guild loop
			Object.values(Guilds).forEach(guild => {
				let guildCards = [];
				// getting cards from guild loop
				this[`player${i}Hand`].forEach(card => {
					if (card.guild === guild) {
						let newIndex = 0;
						// ordering guild cards by value loop
						guildCards.forEach(guildCard => {
							if (CardScores.get(+guildCard.id) < CardScores.get(+card.id)) {
								newIndex++;
							}
						});
						guildCards = [...guildCards.slice(0, newIndex), card, ...guildCards.slice(newIndex)];
					}
				});
				sortedHand.push(...guildCards);
			});
			this[`player${i}Hand`] = structuredClone(sortedHand);
		}
	}


	isHandValid() {
		for (let i = 1; i <= 4; i++) {
			const playerHasTrunfo = !!this[`player${i}Hand`].find(card => card.id === this.trunfo);
			if (playerHasTrunfo) { continue; }

			if (this.calcScore(this[`player${i}Hand`]) < 10) { return false; }
		}
		return true;
	}

	setTrunfo() {
		// shuffeling is player agnostic, so we need to shift the hands according to the order of play before setting the trunfo
		this.shiftHands();

		this.trunfo = this.gameConfig.trunfo === 'up'
			? this[`player${this.currentPlayer}Hand`][0].guild
			: this[`player${this.currentPlayer}Hand`].at(-1).guild;

		// and after setting the trunfo, we can then order the cards for better gaming experience
		this.sortHands();
	}

	shiftHands() {

		// if (this.gameConfig.trunfo === 'up') {
		// 	this[`player${this.currentPlayer}Hand`] = [...tempShiftPivotObject.p1];
		// 	for (let i = 1; i <= 3; i++) {
		// 		const nextPlayer = this.currentPlayer + i > 4 ? this.currentPlayer + i - 4 : this.currentPlayer + i;
		// 		this[`player${this.nextPlayer}Hand`] = [...tempShiftPivotObject[`p${i + 1}`]];
		// 	}
		// }
		// else {
		// 	this[`player${this.currentPlayer}Hand`] = [...tempShiftPivotObject.p4];
		// 	for (let i = 1; i <= 3; i++) {
		// 		const nextPlayer = this.currentPlayer + i > 4 ? this.currentPlayer + i - 4 : this.currentPlayer + i;
		// 		this[`player${this.nextPlayer}Hand`] = [...tempShiftPivotObject[`p${i}`]];
		// 	}
		// }

		const tempShiftPivotObject = { p1: [...this.player1Hand], p2: [...this.player2Hand], p3: [...this.player3Hand], p4: [...this.player4Hand] };

		this[`player${this.currentPlayer}Hand`] = this.gameConfig.trunfo === 'up'
			? [...tempShiftPivotObject.p1]
			: [...tempShiftPivotObject.p4];

		for (let i = 1; i <= 3; i++) {
			const nextPlayer = this.currentPlayer + i > 4 ? this.currentPlayer + i - 4 : this.currentPlayer + i;
			this[`player${nextPlayer}Hand`] = [...tempShiftPivotObject[`p${i + (+!!this.gameConfig.trunfo === 'up')}`]];
		}
	}

	setTempCard(cardOptionValue) { this.tempCard = { guild: cardOptionValue.split('#')[0], id: cardOptionValue.split('#')[1] }; }

	nextMove() {
		this.checkForRenuncia();
		this.pile.push(this.tempCard);
		for (let i = 0; i < this[`player${this.currentPlayer}Hand`].length; i++) {
			if (this.areTheseCardsTheSame(this[`player${this.currentPlayer}Hand`][i], this.tempCard)) {
				this[`player${this.currentPlayer}Hand`] = [...this[`player${this.currentPlayer}Hand`].slice(0, i), ...this[`player${this.currentPlayer}Hand`].slice(i + 1)];
				this.tempCard = null;
				break;
			}
		}
		this.incrementPlayer();
	}

	checkForRenuncia() {
		if (!this.pile.length) { return; }

		// jogou o mesmo naipe, não há renuncia
		const guildToFollow = this.pile[0].guild;
		if (this.tempCard.guild === guildToFollow) { return; }

		// não jogou o mesmo naipe...
		for (const card of this[`player${this.currentPlayer}Hand`]) {
			if (card.guild === guildToFollow) {
				// ...mas tinha carta do mesmo naipe, há renuncia
				const currentRound = Math.floor([...this.teamAScorePile, ...this.teamBScorePile].length / 4) + 1;
				this.renunciasLog.push({ offenderID: this.getPlayerIDByIndex(this.currentPlayer), offenderName: this.getPlayerNameByIndex(this.currentPlayer), play: [...this.pile, this.tempCard], round: currentRound, possiblePlay: card, fullHand: this[`player${this.currentPlayer}Hand`] });
				return;
			}
		}
	}

	incrementPlayer() { this.currentPlayer = (this.currentPlayer === 4) ? 1 : this.currentPlayer + 1; }

	isRoundOver() { return this.pile.length === 4; }

	checkForRoundWinner() {
		this.previousRound = new GameRound();
		this.previousRound.pile = [...this.pile];
		this.previousRound.score = this.calcScore(this.previousRound.pile);
		const lastPlayer = this.currentPlayer === 1 ? 4 : this.currentPlayer - 1;
		const firstPlayer = lastPlayer === 4 ? 1 : lastPlayer + 1;

		let currentWinningCard = this.pile[0];
		this.previousRound.winnerIndex = firstPlayer;
		for (let i = 1; i < 4; i++) {
			const nextCard = structuredClone(this.pile[i]);
			const newWinningCard = this.headToHeadCards(currentWinningCard, nextCard);
			if (this.areTheseCardsTheSame(nextCard, newWinningCard)) {
				currentWinningCard = structuredClone(nextCard);
				this.previousRound.winnerIndex = (firstPlayer + i > 4 ? firstPlayer + i - 4 : firstPlayer + i);
			}
		}
		this.previousRound.winningTeam = ((!!(this.previousRound.winnerIndex % 2)) ? Teams.A : Teams.B);
		this[`team${this.previousRound.winningTeam}ScorePile`].push(...this.pile);
		this.pile = [];
		this.currentPlayer = this.previousRound.winnerIndex;
	}

	calcScore(pile) {
		let score = 0;
		pile.forEach(card => { score += Math.floor(CardScores.get(+card.id)); });
		return score;
	}

	headToHeadCards(card1, card2) {
		// foi jogado trunfo
		if (card2.guild === this.trunfo) {
			// se a original não era trunfo, you win
			if (card1.guild !== this.trunfo) { return card2; }

			// se a original era trunfo, temos de ver a maior
			return CardScores.get(+card1.id) > CardScores.get(+card2.id)
				? card1
				: card2;
		}

		// não foi jogado trunfo, e a original era trunfo, you lose
		if (card1.guild === this.trunfo) {
			return card1;
		}

		// se nenhuma delas é trunfo, e os naipes são diferentes, you also lose
		if (card1.guild !== card2.guild) { return card1; }

		// se nenhuma delas é trunfo, e são do mesmo naipe, temos de ver a maior
		return CardScores.get(+card1.id) > CardScores.get(+card2.id)
			? card1
			: card2;
	}

	areTheseCardsTheSame(card1, card2) { return +card1.id === +card2.id && card1.guild === card2.guild; }

	isGameOver() { return [...this.teamAScorePile, ...this.teamBScorePile].length === (twoCardsDeck ? 8 : fourCardsDeck ? 16 : 40); }

	calcTeamScores() {
		let score = 0;
		this.teamAScorePile.forEach(card => { score += Math.floor(CardScores.get(+card.id)); });
		this.gameScore.teamA = score;

		score = 0;
		this.teamBScorePile.forEach(card => { score += Math.floor(CardScores.get(+card.id)); });
		this.gameScore.teamB = score;

		this.updateContinousScores();
	}

	updateContinousScores() {
		const isCapote = this.checkForCapote();

		if (this.gameScore.teamA > this.gameScore.teamB) { this.continuousScore.teamA += isBandeira ? 4 : isCapote ? 2 : 1; }
		else if (this.gameScore.teamA < this.gameScore.teamB) { this.continuousScore.teamB += isBandeira ? 4 : isCapote ? 2 : 1; }
	}

	checkForCapote(scoreA = this.gameScore.teamA, scoreB = this.gameScore.teamB) { return (scoreA > scoreB ? scoreA - scoreB : scoreB - scoreA) >= 90; }
	checkForBandeira(scoreA = this.gameScore.teamA, scoreB = this.gameScore.teamB) { return (scoreA === 120 || scoreB === 120); }

	resetContinousScores() { this.continuousScore.teamA = 0; this.continuousScore.teamB = 0; }

	getPlayerNameByID(id) {
		for (let i = 1; i <= this.gameConfig.players.size; i++) {
			if (this.gameConfig.players.get(`player${i}`).id === id) {
				return this.gameConfig.players.get(`player${i}`).name;
			}
		}
	}

	getPlayerIndexByID(id) {
		for (let i = 1; i <= this.gameConfig.players.size; i++) {
			if (this.gameConfig.players.get(`player${i}`).id === id) {
				return i;
			}
		}
	}

	getPlayerNameByIndex(index) { return this.gameConfig.players.get(`player${index}`).name; }

	getPlayerIDByIndex(index) { return this.gameConfig.players.get(`player${index}`).id; }

	getNaipeName(guildId) {
		switch (guildId) {
			case Guilds.COPAS:
				return 'Copas :hearts:';
			case Guilds.OUROS:
				return 'Ouros :diamonds:';
			case Guilds.PAUS:
				return 'Paus :clubs:';
			case Guilds.ESPADAS:
				return 'Espadas :spades:';
		}
	}

	getPileText(pile = this.pile) {
		let string = '';

		for (let i = 0; i < pile.length; i++) {
			string += this.getCardName(pile[i]) + ' ';
		}

		return string;
	}

	getCardName(card) {
		for (const [key, value] of Object.entries(Cards)) {
			if (+card.id !== value) { continue; }
			return (key.at(0) + key.slice(1).toLowerCase()) + ' de ' + this.getNaipeName(card.guild);
		}
	}

	triggerRenuncia(userid) { this.renunciaTrigger = userid; }

	isPlayerRenunciaCorrect(acuserID) {
		if (!this.renunciasLog.length) { return false; }
		const offenderID = this.renunciasMap.get(acuserID);
		for (const renuncia of this.renunciasLog) {
			if (renuncia.offenderID === offenderID) {
				this.renunciaRound = renuncia.round;
				return true;
			}
		}
		return false;
	}
};