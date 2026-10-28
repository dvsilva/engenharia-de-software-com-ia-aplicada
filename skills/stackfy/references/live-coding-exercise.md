---
name: live-coding-exercise
description: Exercises for a live coding interview, each a starting point the candidate fills in, a reference solution, and a test suite that runs against either one, as module 12's six-step warm-up does with a function that returns the numbers that appear more than once and its Set card game does with classes in four levels.
---

# Live coding exercise

## Concept

A live coding interview hands the candidate a small problem and watches them solve it aloud, so the method weighs as much as the answer. The course teaches six steps: understand the problem and ask questions, define a test example, explain the plan, write the simplest version, run the tests and the edge cases, and improve it while saying what more time would bring, such as its cost in time and memory. An exercise ships in three parts: a starting point with the signature and an empty body, a reference solution, and a test suite that runs against either one through a switch, so the suite fails until the candidate fills in the starting point and passes against the solution from the start.

Returning the values that appear more than once is a classic warm-up. Counting each value in a hash map takes O(n) time and memory, against O(n²) for comparing every pair, and the order of the answer depends on what the map remembers: a map that keeps insertion order returns the values in the order they first appear.

A longer exercise splits the problem into levels, each with its own suite and each building on the one before, so the candidate shows progress even without finishing. The **Set** card game is one: its 81 cards combine four attributes of three values each, and three cards form a set when every attribute is all the same or all different, which counting the distinct values of each attribute decides. Finding every set on a board checks every triple of cards, O(n³), and a shuffle that takes its random function as an argument lets a test repeat it.

## How the course implements it

The live coding warm-up of module 12's technical interview part is a **Node.js** 18 project without dependencies. Its README states the problem, a list of numbers in and the ones that appear more than once out, with [1, 2, 2, 3, 3, 3] giving [2, 3], and applies each of the six steps to it: asking whether the order matters and whether the list may be empty or hold negative numbers, the example, counting how many times each number appears and keeping those above 1, the simplest version, the empty list and a list without repeats as edge cases, and O(n) in time and memory, with input validation for more time and processing in parts for a list that does not fit in memory.

The starting point exports duplicates with an empty body, so it returns undefined. The solution counts each number in a Map, keeps the entries counted more than once, and returns their numbers in order of first appearance, the order a Map iterates in. A number that appears four times comes back once, and [1, 2, 2, 1] gives [1, 2], not the [2, 1] of the order in which each number repeats.

The suite has five tests on node:test, comparing with assert.deepEqual from node:assert/strict: the problem's example, the empty list, a list without repeats, [5, 1, 5, 1, 2] giving [5, 1], and [-1, -1, 0] giving [-1]. It imports the solution when SOLUTION is set to anything but an empty string and the starting point otherwise, so npm test, which runs node --test, fails all five tests until the starting point is filled in. npm run test:solution runs a script that starts node --test with SOLUTION=1 and exits with its status.

The exercise after it is the **Set** card game in object-oriented **JavaScript**, also a **Node.js** 18 project without dependencies, whose README gives the rule and four levels. src/ holds the starting point, three classes whose methods have commented empty bodies, with the lists of numbers 1 to 3, colors red, green, and purple, shapes oval, diamond, and squiggle, and shadings solid, striped, and open, and Card.parse already written. solution/ holds the answer:

- Level 1, Card: the constructor stores the four values and throws when one is not in its list, compared by includes, so 0, 4, and "Red" are rejected. toString joins them with spaces, as in "2 green diamond striped", and Card.parse splits such a text on spaces and builds the card.
- Level 2, formsSetWith(b, c): for number, color, shape, and shading, each read by name, it returns false when the three cards hold exactly two distinct values, so three copies of one card form a set.
- Level 3, Deck: the constructor copies the list it receives, Deck.full() by default, which builds the 81 cards in nested loops of number, color, shape, and shading. size is a getter, shuffle(random) walks from the last position down to the second and swaps each with the one at Math.floor(random() * (position + 1)), the Fisher-Yates shuffle, and returns the deck, and draw(n) takes n cards from index 0 with splice, which returns only the ones left when there are fewer.
- Level 4, Board: the constructor keeps the caller's deck and draws 12 cards from it, findSets checks every triple in three nested loops and returns each set in board order, by the positions of its first, second, and third cards, and dealUntilSet draws 3 more cards while the board has no set and the deck has cards, and returns the board.

test/level1.test.js to level4.test.js hold 6, 7, 7, and 6 tests on node:test, importing the classes from support/helper.js, which imports solution/ when SOLUTION is set and src/ otherwise and keeps a board of 12 cards without a set. They never try two equal shapes and one different, the order a shuffle produces, or a draw of 0. npm test runs every level, npm run test:1 to test:4 one level, and npm run test:solution the same verify script as the warm-up.

## What usually goes wrong in other languages

- **Go**'s map iterates in an order it randomizes on purpose, and **Rust**'s HashMap, **Java**'s HashMap, **C#**'s Dictionary, and **C++**'s unordered_map promise no order, while **C++**'s std::map and **Java**'s TreeMap sort their keys, so ranging over the counts returns [1, 5] for [5, 1, 5, 1, 2] or changes between runs. A list of first appearances beside the map keeps the order, as do **Python**'s dict and collections.Counter, **Java**'s LinkedHashMap, **Rust**'s **indexmap**, and **C#**'s GroupBy, which yields groups in the order their keys first appear. Counter's most_common sorts by count instead.
- Collecting a number when it is seen the second time returns the order in which numbers repeat, which differs from first appearance for [1, 2, 2, 1].
- A **JavaScript** or **TypeScript** object used as the counter turns the numbers into string keys and lists the non-negative integers in ascending order before the rest, so Object.keys returns ["1", "5"] for [5, 1, 5, 1, 2]. A Map keeps the numbers and their order.
- **JavaScript** has a single number type, so the original also takes fractions and integers up to 2^53. The cases pass small integers only, which any integer type holds.
- assert.deepEqual tells undefined from an empty array. **Go**'s reflect.DeepEqual tells a nil slice from an empty one in the same way, while slices.Equal does not, and encoding/json writes a nil slice as null, so the solution returns an empty slice.
- formsSetWith reads each attribute by name in a loop. **Python** can with getattr, while **Go**, **Rust**, **Java**, and **C#** reach a field by name only through reflection, so they call one generic helper per attribute or keep the four values in an array.
- The Card constructor throws on a value outside its lists. **Python** raises ValueError, and **Java** and **C#** throw IllegalArgumentException and ArgumentException, while **Go**'s NewCard returns an error beside the card and **Rust**'s Card::new returns a Result. includes compares strictly, so "Red" is rejected, which an enum parsed without regard to case would accept.
- Deck's default argument, Deck.full(), runs on every call. **Python** evaluates a default once, where the function is defined, before its class exists, so the deck defaults to None and builds the full list in the body. **Go** has no default arguments, and **Rust** gives Deck a Default implementation.
- The Deck constructor copies the list, so shuffle and draw never touch the caller's. A **Go** slice shares its backing array, so without slices.Clone the shuffle reorders the caller's cards, and **Rust** takes a slice and copies it with to_vec.
- splice and **Python**'s slices stop at the end of the list, while **Go**'s slicing and **Rust**'s drain panic past it, so draw clamps the count to the cards left first.
- The shuffle takes its random function as an argument, so a test can repeat it, and library shuffles do not: **Python**'s random.shuffle dropped that argument in 3.11, **Java**'s Collections.shuffle asks a Random for integers, and **Go**'s rand.Shuffle and **Rust**'s SliceRandom draw from their own generators. The loop is written by hand, from the last position down to the second, so the same numbers give the same order. The suite's sequence, x = (x * 9301 + 0.49297) % 1, uses a floating-point remainder, which **Python**'s and **Rust**'s % and **Go**'s math.Mod compute the same way for positive numbers.
- The Board keeps the caller's deck, so the caller sees it shrink. **Python**, **Java**, and **C#** classes share it by reference, while a **Go** Board holds a \*Deck, because a Deck value copies the slice header and leaves the caller's size at 81, and a **Rust** Board owns its deck, so the cards left are read through board.deck.
- toString becomes **Python**'s \_\_str\_\_, **Go**'s String() for fmt.Stringer, **Rust**'s Display, which provides to_string, and an override of **Java**'s toString or **C#**'s ToString. The size getter becomes a property in **Python** and **C#** and a method elsewhere, and shuffle and dealUntilSet return the object for chaining, &mut Self in **Rust**.
- findSets returns each set in board order, by the positions of its first, second, and third cards, the order of **Python**'s itertools.combinations. Looping in another order finds the same sets in a different list.
- The suite chooses its implementation while it loads, through a dynamic import. **Python** can choose with importlib, while compiled targets build both and choose inside the tests, so the starting point must compile: its body returns an empty value or panics, as **Rust**'s todo!() does, and the suite still fails. **Go**'s test cache ignores a variable read while the package initializes, so a choice made there replays one run's result for the other. **Rust** can also choose at compile time, in a build script that turns the variable into a cfg and asks **Cargo** to rebuild whenever it changes.
- The cases check the suite only by whether it fails, against the starting point, or succeeds, against the solution, never by its report, so each target keeps its own runner, such as **pytest**, go test, or cargo test, which fails with 101 where the others fail with 1. The **Set** game's cases do so for each level's suite, so a transcription can be checked one level at a time.
- The solutions only export a function or classes, so the cases run a driver beside them that prints the answer as one line of JSON. The warm-up's takes the list as its only argument, a JSON array. The **Set** game's takes the solution's file, such as solution/card, an operation named after the original's method, and JSON arguments, where a deck is a list of card texts or null for the full deck, so a target that renames formsSetWith to forms_set_with still answers formsSetWith.

## How close common targets get

Every target has a hash map, a way to keep data with its methods, and a test runner, so every target is a direct equivalent:

| Target                            | Fit               | Library                                                                                            |
| --------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| **Python**                        | Direct equivalent | dict or collections.Counter, and classes, with **pytest**                                          |
| **JavaScript** and **TypeScript** | Direct equivalent | Map and classes, with node:test                                                                    |
| **Go**                            | Direct equivalent | A map with a slice of first appearances, and structs with methods, with go test                    |
| **Rust**                          | Direct equivalent | HashMap with a Vec of first appearances, or **indexmap**, and structs with traits, with cargo test |
| **Java**                          | Direct equivalent | LinkedHashMap and classes, with **JUnit**                                                          |
| **C#**                            | Direct equivalent | LINQ's GroupBy and classes, with **xUnit**                                                         |
| **C++**                           | Direct equivalent | std::unordered_map with a std::vector of first appearances, and classes, with **GoogleTest**       |

The tested **Go** transcription of the warm-up keeps the starting point, the solution, the suite, and the verify script with the standard library alone, plus the driver the cases run. The tested **Rust** transcription of the **Set** game keeps the four levels the same way, chooses the implementation in a build script, and adds the driver, with **serde_json** as its only dependency.

## Tolerance

The exercises are deterministic, since the shuffle takes its numbers from the case, so the drivers' answers are compared exactly, in order, and the suites only by whether they fail.

## Where it appears

- modulo12-carreira-engenheiros-ia/parte-2-entrevistas-tecnicas/01-live-coding-duplicates (the six-step warm-up that returns the numbers that appear more than once)
- modulo12-carreira-engenheiros-ia/parte-2-entrevistas-tecnicas/02-live-coding-set-game (the **Set** card game in object-oriented **JavaScript**, in four levels: Card, the set rule, Deck, and Board)
