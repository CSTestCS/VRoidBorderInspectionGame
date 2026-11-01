// Static game data: names, places, dialogue pools, interrogation motives.

export const FIRST_F = ['Ada', 'Mira', 'Lena', 'Rosa', 'Iris', 'Nadia', 'Clara', 'June', 'Hana', 'Elena', 'Maya', 'Sofia', 'Vera', 'Talia', 'Nora', 'Lucia', 'Greta', 'Amara', 'Esme', 'Wren', 'Celia', 'Ines', 'Yara', 'Olga', 'Petra', 'Ruth', 'Delia', 'Kira', 'Fern', 'Margo', 'Selma', 'Ivy', 'Lorna', 'Agnes', 'Beatrix', 'Dora', 'Edith', 'Mabel', 'Pearl', 'Rina', 'Sunny', 'Tess', 'Una', 'Zoe', 'Aiko', 'Noor', 'Leila', 'Freya'];
export const FIRST_M = ['Elias', 'Marcus', 'Tomas', 'Victor', 'Owen', 'Felix', 'Hugo', 'Ivan', 'Jonah', 'Kai', 'Leon', 'Milo', 'Nico', 'Oscar', 'Pavel', 'Rafael', 'Silas', 'Theo', 'Abel', 'Bruno', 'Cyrus', 'Dmitri', 'Ezra', 'Gideon', 'Henrik', 'Isaac', 'Joel', 'Karl', 'Luca', 'Mateo', 'Nathan', 'Otto', 'Quinn', 'Ronan', 'Saul', 'Tobias', 'Walter', 'Yusuf', 'Arthur', 'Bernard', 'Cecil', 'Desmond', 'Edgar', 'Frank', 'Harold', 'Kenji', 'Omar', 'Rhys'];
export const LAST = ['Adler', 'Becker', 'Calder', 'Dorsey', 'Ellison', 'Farrow', 'Garner', 'Hale', 'Ibarra', 'Jansen', 'Keller', 'Lindqvist', 'Moreau', 'Novak', 'Okafor', 'Petrov', 'Quint', 'Ramos', 'Sato', 'Thorne', 'Ulrich', 'Varga', 'Whitlock', 'Xu', 'Young', 'Zeller', 'Ashby', 'Brandt', 'Castillo', 'Duval', 'Esposito', 'Fischer', 'Grady', 'Holloway', 'Iwata', 'Kowalski', 'Lowell', 'Mendez', 'Nakamura', 'Orlov', 'Pryce', 'Reyes', 'Sorensen', 'Tanaka', 'Vance', 'Weller', 'Abara', 'Bishop', 'Crane', 'Drummond', 'Fenwick', 'Hartley', 'Kaur', 'Marsh', 'Osei', 'Pike', 'Rourke', 'Stroud', 'Voss', 'Wilde'];
export const ORIGINS = ['Rustwater', 'New Dunmore', 'Ashfield Camp', 'Saltmarsh', 'Copperline', 'Greyhaven Ruins', 'Fort Kettle', 'Hollow Creek', 'Ironbridge', 'Pale Reach', 'Cinder Flats', 'Northgate', 'Bramble Hill', 'Sunken Mile', 'Old Harbor', 'Redwater Station', 'Thornfield', 'Dustbowl Market', 'Lantern Point', 'Millbrook'];
export const OCCUPATIONS = ['Nurse', 'Electrician', 'Teacher', 'Mechanic', 'Farmer', 'Clerk', 'Cook', 'Welder', 'Pharmacist', 'Engineer', 'Carpenter', 'Courier', 'Librarian', 'Plumber', 'Seamstress', 'Driver', 'Medic', 'Radio Operator'];
export const PURPOSES = [
  'The water at our camp went bad. I need somewhere safe.',
  'Raiders burned my settlement. I have nowhere else to go.',
  'My sister made it in last year. I want to be with her.',
  'I heard the Haven needs workers. I can work.',
  'The storms are getting worse out there. Please.',
  "I've been walking for nine days. I just want to sleep somewhere safe.",
  "I'm a trained medic. I can be useful in there.",
  'My caravan was attacked. I was the only one who got away.',
  "There's no food left in the eastern towns.",
  'The radiation counts keep climbing back home.',
  'I want my kids to grow up somewhere with walls.',
  'I was told this is the last safe city.',
];

export const GREETINGS = ['Hello...', 'Is this the way in?', 'Please, I need to get inside.', "I've got my papers.", 'Evening, officer.', "I hope I'm not too late.", 'Hi. Here you go.'];
export const HANDOVER = ['Here is my ID.', 'This is all I have.', 'My card.', "Here. It's a bit worn.", 'Here you go, officer.'];
export const NAME_HESITATE = ['Uh... ', 'It is... ', 'Um, ', 'My name? ', ''];
export const NO_CONTRABAND = ["No, nothing.", "Nothing like that.", "Just my clothes.", "No, sir.", "No. I swear."];
export const NO_CONTRABAND_LIE = ["N-no. Nothing.", "Nothing. Why?", "No... nothing at all.", "What? No."];
export const NO_BITE = ["No. I've been careful.", "Never.", "No, nothing like that.", "I'm healthy, I promise."];
export const NO_BITE_LIE = ["No... why would you ask that?", "I-I'm fine.", "No. Can we hurry this up?", "It's nothing. Just tired."];

export const REACT = {
  stripStart: ['Do I really have to...?', 'Okay... okay.', "It's freezing in here.", 'Fine. Just be quick.', '...Alright.'],
  confiscate: ['Hey, I need that!', 'Fine. Take it.', "That's for protection!", "Come on...", "It's not what it looks like."],
  returnItem: ['Thank you.', 'Thanks. That means a lot.', 'Oh, good.'],
  burn: ['Those are my only clothes!', "Wait - you're burning it?", 'Oh no...', "Was it that bad?"],
  hoseStart: ['Ah! Cold!', "Gah - that's freezing!", 'Hey!', 'Ack!'],
  hoseFace: ['Pfft - my face!', 'Mmph!', "Hey, watch it!"],
  armsUp: ['Like this?', 'Okay.', 'Sure.'],
  turn: ['Turning around.', 'Okay.', 'Like this?'],
  dressed: ['Finally. Thank you.', 'Much better.', 'Ah, warm clothes.'],
  admit: ['Thank you! Thank you so much!', "I'm really in?", 'Finally... safe.', 'Thank you, officer.'],
  deny: ['No! Please!', "You can't do this!", 'Please, I have nowhere to go!', "You'll regret this."],
  tank: ["A tank? What's wrong with me?", 'Is it serious?', "I don't want to go in there...", 'Will I be okay?'],
  interro: ['Questioning? For what?', 'I can explain!', "This is a mistake.", 'Wait, wait...'],
  release: ['I feel... better.', 'How long was I in there?', 'Thank you, doctor.'],
};

export const MOTIVES_HARMLESS = [
  { lie: 'any', text: "The card belonged to my brother. He died on the road. Mine burned with our house - I was scared you'd turn me away without one." },
  { lie: 'any', text: 'I traded a month of food for this card. I had nothing else. I just wanted a chance to get in.' },
  { lie: 'name', text: "I've used a different name since I left an abusive husband in Rustwater. I was afraid he'd find me in the records." },
  { lie: 'details', text: 'The card is old. I was a child when it was issued - I lied about my age to get it so I could work. That is all.' },
  { lie: 'portrait', text: "It's my cousin's card. We look nothing alike, I know. My own papers were stolen two days ago." },
  { lie: 'seal', text: "A trader sold it to me. I didn't know it was fake, I swear. I can give you my real name - it's all I have." },
  { lie: 'any', text: "I was a deserter from the militia. Not dangerous - I just didn't want to be shot for it. I'll cooperate with anything." },
];
export const MOTIVES_DANGEROUS = [
  { text: "Subject eventually admitted to scouting the Haven's defences for the Ash Kings raider band. Map sketches found sewn into clothing lining." },
  { text: "Subject's real identity matches a wanted notice: three killings in Copperline. Subject became violent during questioning." },
  { text: "Subject refused to explain the false identity and repeatedly asked about the Haven's water supply and generator access." },
  { text: "Subject is a known saboteur from the Pale Reach cult. Admitted intention to 'cleanse' the Haven." },
  { text: 'Subject confessed to being sent by smugglers to set up a contraband route through the checkpoint.' },
  { text: 'Story collapsed under questioning; subject was carrying coded notes and contact names for a raider network.' },
];
export const INTERRO_Q = [
  'Why does your card not match you?',
  'Who gave you this identity?',
  'What is your real name?',
  'What do you want inside the Haven?',
  "Who sent you?",
];
