export class GameConfig {
	players; // GamePlayer
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

export const cardGuilds = {
	'OUROS': 'diamonds',
	'PAUS': 'clubs',
	'ESPADAS': 'spades',
	'COPAS': 'hearts',
};

export const cardIDs = {
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

export const teamIDs = {
	'teamA': 1,
	'teamB': 2,
};


export const initFormActionIDs = {
	'NEXT': 'next',
	'PREVIOUS': 'prev',
	'CANCEL': 'cancel',
	'START': 'start',
};


export const initFormIDs = {
	'PLAYER1': 'player1',
	'PLAYER2': 'player2',
	'PLAYER3': 'player3',
	'PLAYER4': 'player4',
	'DEALER': 'dealer',
};

export const whisperActions = {
	'CARDPLAYED': 'cardPlayed',
	'CARDSELECTED': 'cardSelected',
};

export const endGameActions = {
	'END': 'endGame',
	'MORE': 'nextGame',
	'RESET': 'resetAcomulated',
};

export const cardScoresMap = new Map();
cardScoresMap.set(cardIDs.DOIS, 0.2);
cardScoresMap.set(cardIDs.TRÊS, 0.3);
cardScoresMap.set(cardIDs.QUATRO, 0.4);
cardScoresMap.set(cardIDs.CINCO, 0.5);
cardScoresMap.set(cardIDs.SEIS, 0.6);
cardScoresMap.set(cardIDs.VALETE, 2);
cardScoresMap.set(cardIDs.DAMA, 3);
cardScoresMap.set(cardIDs.REI, 4);
cardScoresMap.set(cardIDs.MANILHA, 10);
cardScoresMap.set(cardIDs.ÁS, 11);


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
	renuncia;
	currentPlayer;
	gameScore;
	continuousScore;
	interaction;
	gameConfig;
	tempCard;

	constructor() {
		this.shuffleNewDeck();
		this.continuousScore = { teamA: 0, teamB: 0 };
		this.interaction = null;
		this.gameConfig = null;
	};

	incrementPlayer() {
		this.currentPlayer = this.currentPlayer === 4
			? 1
			: this.currentPlayer++;
	}

	getPlayerName(index) {
		return this.gameConfig.players.get(`player${index}`).name;
	}

	setTempCard(cardOptionValue) {
		this.tempCard = { guild: cardOptionValue.split('#')[0], id: cardOptionValue.split('#')[1] };
	}

	shuffleNewDeck() {
		this.pile = [];
		this.teamAScorePile = [];
		this.teamBScorePile = [];
		this.player1Hand = [];
		this.player2Hand = [];
		this.player3Hand = [];
		this.player4Hand = [];
		this.trunfo = '';
		this.renuncia = [];
		this.currentPlayer = 1;
		this.gameScore = { teamA: 0, teamB: 0 };
		this.tempCard = null;

		Object.values(cardGuilds).forEach(guild => {
			Object.values(cardIDs).forEach(id => {
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
				case 1:
					this.player2Hand.push(cardDrawn);
				case 2:
					this.player3Hand.push(cardDrawn);
				case 3:
					this.player4Hand.push(cardDrawn);
			}
		}

		if (!this.isHandValid()) { this.shuffleNewDeck(); }
	}

	isHandValid() {
		// tem de ter 10 pontos, ou 1 trunfo no mínimo
		return true;
	}

	checkForRenuncia() {
		if (!this.pile.length) { return; }

		// jogou o mesmo naipe, não há renuncia
		const guildToFollow = this.pile[0].guild;
		if (this.tempCard.guild === guildToFollow) { return; }

		// tinha carte do naipe, há renuncia
		const playerHand = this[`player${this.currentPlayer}Hand`];
		for (const card of playerHand) {
			if (card.guild === guildToFollow) { this.renunciaFound(); }
		}

		return;
	}

	renunciaFound() {
		const currentRound = Math.floor([...this.teamAScorePile, ...this.teamBScorePile].length / 4) + 1;
		this.renuncia.push({ offender: this.getPlayerName(this.currentPlayer), play: this.pile, round: currentRound });
	}

	nextMove() {
		this.pile.push(this.tempCard);
		for (let i = 0; i < this[`player${this.currentPlayer}Hand`].length; i++) {
			if (this[`player${this.currentPlayer}Hand`][i].id === this.tempCard.id) {
				this[`player${this.currentPlayer}Hand`] = [
					...this[`player${this.currentPlayer}Hand`].slice(0, i),
					...this[`player${this.currentPlayer}Hand`].slice(i + 1),
				];
				this.tempCard = null;
				break;
			}
		}


	}

	isRoundOver() {
		return this.pile.length === 4;
	}

	checkForRoundWinner() {
		const lastPlayer = this.currentPlayer;
		const firstPlayer = lastPlayer === 4 ? 1 : lastPlayer + 1;

		let currentWinningCard = this.pile[0];
		let currentWinningPlayer = firstPlayer; // o vençedor começar com o primeiro jogador

		for (let i = 1; i < 4; i++) {
			const nextCard = this.pile[i];
			const newWinningCard = this.headToHeadCards(currentWinningCard, nextCard);
			if (nextCard === newWinningCard) {
				currentWinningCard = nextCard;
				currentWinningPlayer = (firstPlayer + i > 4 ? firstPlayer + i - 4 : firstPlayer);
			}
		}

		const winner = (!!currentWinningPlayer % 2 ? 'teamA' : 'teamB');
		this[`${winner}ScorePile`].push(...this.pile);
		this.pile = [];
		return winner;
	}

	headToHeadCards(card1, card2) {
		// jogaste trunfo
		if (card2.guild === this.trunfo) {
			// se a original não era trunfo, you win
			if (card1.guild !== this.trunfo) { return card2; }

			// se a original era trunfo, temos de ver a maior
			return cardScoresMap.get(card1.id) > cardScoresMap.get(card2.id)
				? card1
				: card2;
		}

		// não jogaste trunfo, e a original era trunfo, you lose
		if (card1.guild === this.trunfo) {
			return card1;
		}

		// se nenhuma delas é trunfo, e os naipes são diferentes, you also lose
		if (card1.guild !== card2.guild) { return card1; }

		// se nenhuma delas é trunfo, e são do mesmo naipe, temos de ver a maior
		return cardScoresMap.get(card1.id) > cardScoresMap.get(card2.id)
			? card1
			: card2;
	}

	isGameOver() {
		return [...this.teamAScorePile, ...this.teamBScorePile].length === 40;
	}

	calcTeamScores() {
		let score = 0;
		this.teamAScorePile.forEach(card => { score += Math.floor(cardScoresMap.get(card.id)); });
		this.gameScore.teamA = score;

		score = 0;
		this.teamBScorePile.forEach(card => { score += Math.floor(cardScoresMap.get(card.id)); });
		this.gameScore.teamB = score;

		this.updateContinousScores();
	}

	updateContinousScores() {
		const isCapote = this.checkForCapote(this.gameScore.teamA, this.gameScore.teamB);

		if (this.gameScore.teamA > this.gameScore.teamB) {
			this.continuousScore.teamA += isCapote ? 3 : 1;
		}
		else if (this.gameScore.teamA < this.gameScore.teamB) {
			this.continuousScore.teamB += isCapote ? 3 : 1;
		}
	}

	checkForCapote(scoreA, scoreB) {
		const diff = (scoreA > scoreB ? scoreA - scoreB : scoreB - scoreA);
		return diff >= 90;
	}

	getGameWinner() {
		// this.calcTeamScores()
	}

	resetContinousScores() {
		this.continuousScore.teamA = 0;
		this.continuousScore.teamB = 0;
	}
};
