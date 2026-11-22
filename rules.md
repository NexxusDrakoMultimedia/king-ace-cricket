# King and Ace Cricket

King and Ace Cricket is a card game invented by Pyra Drake.

## Rules

The game is played with a standard 52-card deck, either solo as a simulation, or as a two-player game where two teams compete against each other in a simulated cricket match. Suits never matter. Ace is the lowest card and King the highest.

### Setup

A coin flip decides who bats first and who bowls first.

### Overs and hands

An over is six balls. At the start of each over, the batter and the bowler each draw a hand of six cards. Each ball, both players secretly choose one card from their hand and reveal them together. By the end of the over every card in each hand has been played once, so the skill is in choosing *when* to play your strong and weak cards.

### Resolving a ball

- If either player plays a **King**, it is a **wicket**, no matter who plays it, **unless** the other player's card is a **Jack, Queen or King**. Those neutralise the King and the ball is a **dot ball** (two Kings cancel each other out).
- Otherwise the higher card wins. Aim to play a card higher than your opponent's.
  - If the **batter's** card is higher, the batter scores runs according to the batter's card (see below).
  - If the **bowler's** card is higher, it is a **dot ball**.
  - If the cards are **tied**, it is a **dot ball**.

A wicket can therefore only come from a King. Holding a Jack, Queen or King is a defence against the opponent's King, so it can be worth saving one for the right ball. A batter holding a King will have to play it at some point, and it is only safe if the bowler's card that ball is a Jack, Queen or King.

### Card values (two-player)

| Card | Runs |
| --- | --- |
| Ace to 4 | 1 |
| 5 to 7 | 2 |
| 8 | 3 |
| 9 to 10 | 4 |
| Jack, Queen | 6 |
| King | wicket (unless neutralised by a Jack, Queen or King) |

### Innings and winning

An innings ends after a predetermined number of overs (10 by default), or after ten wickets, whichever comes first. Ten overs is a good length: wickets fall steadily and about one innings in seven ends all out. Much longer and innings tend to end by wickets before the overs run out. Then the players change sides. Standard cricket scoring rules decide who wins, and a standard cricket scoresheet can be used to score the game.

### Shuffling

A hand is one over. In the two-player game, gather all 52 cards and shuffle after every 2 overs.

## Solo mode

Solo mode simulates a batting innings: you only play the batting side. Each over you draw a hand of six cards and play every card in it, one per ball, with the card alone deciding the result of the ball. A solo innings is 20 overs by default, and you shuffle all 52 cards after every 4 overs. In simulation a 20-over innings averages about 138 runs (roughly 7.4 an over), with fours and sixes at about the frequency of real T20 cricket.

| Card | Result |
| --- | --- |
| Ace to 4 | dot ball |
| 5 to 9 | 1 run |
| 10 | 2 runs |
| Jack | 4 runs |
| Queen of hearts or diamonds (red) | 6 runs |
| Queen of spades or clubs (black) | 4 runs |
| King | wicket |

Suit only matters for the Queen in solo mode, and nowhere in the two-player game.

### Solo matches between two teams

Two teams can play a match under the solo rules. A coin toss decides who bats first, then each team bats one solo innings and the second chases the first's total, winning as soon as it passes it. Equal scores are a tie (a knockout match settles a tie on fewer wickets lost, then a coin toss).

The cards alone decide every ball, so the fielding side's bowling is only for the scorebook: their five lowest in the batting order bowl in turn, starting from the bottom (11, 10, 9, 8, 7, then 11 again). Nobody bowls two overs in a row or more than a fifth of the overs, as in real limited-overs cricket, and every wicket is credited to the bowler of that over.

### Playoffs

A league can end in a knockout playoff for any number of its top teams. They are seeded by where they finished in the table, and the bracket is the next size up out of 2, 4, 8 or 16: the top seeds fill the empty places with a bye into the second round. Seeds meet in the standard order (1 plays the lowest seed, and 1 and 2 can only meet in the final).

### Groups (Worlds)

A World Cup-style format: the teams are drawn into groups of a chosen size, the fewest groups that fit (some can have one fewer team). The seeds are split into pots of one team per group, and each group draws one team from each pot, so the strongest teams start in different groups. Each group is a round robin with its own table.

A chosen number from the top of every group go through to a knockout. Every group winner is seeded above every runner-up, and so on; within the same place, teams are ranked on points per game, then net run rate. Byes work as in the playoffs, and two teams from the same group are kept apart in the first knockout round wherever another tie lets them swap.

## Disclaimer

I must note that other people have probably created similar rules, and I do not claim to have invented the game, merely designed this particular variant. I made a mockup of the solo game in 2007 using GameMaker 7 and distributed that version amongst friends and family, and this ruleset is based on an evolution of said mockup.

## License

This game is licensed Creative Commons Zero.
