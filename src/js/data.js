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
  "Our well ran dry three weeks ago. We've been drinking rainwater.",
  'The militia took everything we had. There is nothing to go back to.',
  "I can fix generators, pumps, radios. Anything with wires.",
  'My husband is already inside. They said I could join him.',
  "I'm a teacher. Children need teachers, even now.",
  "The sickness reached our town. I left before it got me.",
  "I don't want much. A bed and four walls.",
  "Honestly? I'm tired of being afraid every night.",
  'I used to farm. I can grow food in your hydroponics.',
  'A radio broadcast said the Haven was taking people in.',
  'The bridge at Ironbridge collapsed. We were cut off for months.',
  "I've got nobody left out there. Nobody.",
  "I'm a cook. I can make anything taste like something.",
  'My mother told me to come here before she passed.',
  "The traders stopped coming. That's how you know a town is dying.",
];

export const GREETINGS = [
  'Hello...', 'Is this the way in?', 'Please, I need to get inside.', "I've got my papers.", 'Evening, officer.', "I hope I'm not too late.", 'Hi. Here you go.',
  'Hello? Can you hear me through this thing?', "Finally. I didn't think this place was real.", 'Good... morning? I lost track of time.', 'Is the line always this long?',
  "Officer. I've come a long way.", "Please tell me I'm in the right place.", 'Hey. Uh, hi.', "I was told to report here.", 'Is it safe in there? Really safe?',
  "Hi there. Sorry, I'm a bit of a mess.", "Hello, sir. Or ma'am. Sorry, the glass.", 'Thank god, a real person.', "Don't shoot, I'm friendly.",
];
export const HANDOVER = [
  'Here is my ID.', 'This is all I have.', 'My card.', "Here. It's a bit worn.", 'Here you go, officer.', 'Careful, it is the only one I have.',
  'It got wet once, sorry.', "Here. Everything's on there.", 'Do you need anything else?', 'My papers, as asked.', "Here. I've kept it safe the whole way.",
];
export const NAME_HESITATE = ['Uh... ', 'It is... ', 'Um, ', 'My name? ', '', 'Right, it is ', 'Oh, uh, '];
export const NO_CONTRABAND = ['No, nothing.', 'Nothing like that.', 'Just my clothes.', 'No, sir.', 'No. I swear.', 'Only what I am wearing.', "Nothing. You can check.", "No. I traded everything for food.", "Nope. Nothing dangerous."];
export const NO_CONTRABAND_LIE = ['N-no. Nothing.', 'Nothing. Why?', 'No... nothing at all.', 'What? No.', "Why would I carry anything?", 'Of course not.', "No, no. Definitely not."];
export const NO_BITE = ["No. I've been careful.", 'Never.', 'No, nothing like that.', "I'm healthy, I promise.", 'No bites. No scratches.', "I stayed away from the dead zones.", "No. I'd know."];
export const NO_BITE_LIE = ['No... why would you ask that?', "I-I'm fine.", 'No. Can we hurry this up?', "It's nothing. Just tired.", "It's a rash. Just a rash.", "I'm not sick. I'm not."];

// favor-aware reaction pools: { neutral, friendly, hostile }
export const REACT = {
  stripStart: ['Do I really have to...?', 'Okay... okay.', "It's freezing in here.", 'Fine. Just be quick.', '...Alright.'],
  confiscate: { neutral: ['Hey, I need that!', 'Fine. Take it.', "That's for protection!", 'Come on...', "It's not what it looks like."], friendly: ['I understand. Rules are rules.', "Okay. I trust you.", 'Fair enough.'], hostile: ['Thief!', "Of course you'd take it.", "You're enjoying this, aren't you?"] },
  returnItem: { neutral: ['Thank you.', 'Thanks. That means a lot.', 'Oh, good.'], friendly: ['Thank you so much!', "You're kind. Thank you.", 'I was so worried about that.'], hostile: ['Finally.', 'Took you long enough.'] },
  burn: { neutral: ['Those are my only clothes!', "Wait - you're burning it?", 'Oh no...', 'Was it that bad?'], friendly: ["If you say so... I trust you.", 'Better safe, I guess.'], hostile: ["Unbelievable.", 'You just burn whatever you like?', "I'll freeze because of you."] },
  hoseStart: ['Ah! ...Oh. It is warm.', 'Whoa - hey! ...okay, that is actually nice.', 'Hey!', 'Ack! Warn me next time!', 'Eek! ...huh, warm water.', 'Gah! At least it is warm.', 'Oh! That is... warmer than I expected.', 'Mm. Warm water. I forgot what that felt like.'],
  hoseDressed: ['Hey! I am still dressed!', 'My clothes! What are you doing?!', 'Seriously? I have not even undressed yet!', 'Stop it! You are soaking everything!', 'Is this part of the procedure?!', 'Ugh, now it is all wet and heavy.', 'Hey - cut that out!'],
  hoseDressedAgain: ['I just got my clothes back!', 'Oh, come on - they were finally dry!', 'Really? Again?!', 'What is wrong with you?', 'Now I have to walk around soaking wet!', 'Was that necessary?'],
  hoseExpect: ['Warm water. I have dreamed about this.', 'Go ahead. I am ready.', 'Ahh. That is nice and warm.', 'Mm, warm. Thank you.', 'Okay, scrub away.', 'First hot water in months.'],
  // sent from the window to decontamination
  whereGo: ['Okay. Where do I go?', 'Which way?', 'Through there?', 'Where now?', 'Uh... which door?', 'Where are you sending me?', 'Is it that door?', 'Okay... then what?', 'Decon? What is that?', 'Do I just follow the corridor?', 'Wait, where do I go now?', 'And now?'],
  whereGoExpect: ['Decontamination, right? I know the drill.', 'Down the corridor. Got it.', 'Wash room. I heard about this.', 'Alright. Strip and wash, yes?', 'I know where to go. Thank you.', 'Here we go, then.', 'They told us about this part at camp.'],
  // first piece of clothing comes off
  stripSurprise: ['Wait, you want me to undress?!', 'Everything? You are serious?', 'Nobody said anything about this!', 'Here? In front of you?', 'Is this really necessary?', 'What - my clothes too?', 'Hold on, hold on. All of it?'],
  stripExpect: ['I know, I know. Clothes off.', 'Standard procedure, right? Go ahead.', 'I heard you would do this. Fine.', 'Let us get it over with.', 'I figured this was coming.', 'Go on. I am used to checkpoints.'],
  removeExpect: ['Here.', 'Next one.', 'There you go.', 'Mm-hm.', 'Okay.', 'Careful with that one.', 'Take it.', 'That one is pretty dirty, sorry.'],
  hoseFace: ['Pfft - my face!', 'Mmph!', 'Hey, watch it!', 'Not the eyes!', 'I can\'t breathe!'],
  flashlight: ['Ow, my eyes!', 'Hey, that is bright!', 'Could you not?', 'Ugh, I am seeing spots.'],
  armsUp: ['Like this?', 'Okay.', 'Sure.', 'Arms up, got it.', 'How long do I hold this?'],
  armsDown: ['Thanks.', 'Phew.', 'Okay.'],
  turn: ['Turning around.', 'Okay.', 'Like this?', 'This way?'],
  dressed: { neutral: ['Finally. Thank you.', 'Much better.', 'Ah, warm clothes.'], friendly: ['Thank you, really.', 'You have been kind.', 'Warm at last!'], hostile: ['About time.', 'Whatever.'] },
  admit: { neutral: ['Thank you! Thank you so much!', "I'm really in?", 'Finally... safe.', 'Thank you, officer.'], friendly: ["You're a good person. I won't forget this.", 'Thank you for treating me like a human.', 'I hope we meet again inside!'], hostile: ['Took long enough.', 'Great. Can I go now?', "Don't expect a thank you."] },
  admire: ['You saved my life. I mean it.', 'I would have died out there. Thank you, for everything.', "I'll tell everyone inside what you did for me.", "You didn't give up on me. Thank you."],
  deny: { neutral: ['No! Please!', "You can't do this!", 'Please, I have nowhere to go!', "You'll regret this."], friendly: ["I... I thought you were on my side.", 'Please... reconsider. Please.'], hostile: ["You'll pay for this.", 'I hope you rot in there.', 'Monster.'] },
  tank: { neutral: ["A tank? What's wrong with me?", 'Is it serious?', "I don't want to go in there...", 'Will I be okay?'], friendly: ["If you think it is best... okay.", 'Please look after me.'], hostile: ['You are locking me in a tube?!', 'This is insane.'] },
  interro: { neutral: ['Questioning? For what?', 'I can explain!', 'This is a mistake.', 'Wait, wait...'], friendly: ["I'll tell them everything, I promise.", 'Okay... I understand.'], hostile: ["You're making a big mistake.", 'I knew it. You never believed me.'] },
  release: ['I feel... better.', 'How long was I in there?', 'Thank you, doctor.', 'My head is so clear now.', 'Am I cured? Really?'],
  // clothing removal, by category (f = women, m = men)
  remove: {
    accessory: ['Here.', 'Careful with those.', 'Sure, take it.', "Don't lose that."],
    glasses: ['Careful, I can barely see without them.', "Don't scratch them, please.", 'Everything is blurry now.'],
    hat: ['There you go.', 'My hair is a mess under there.'],
    gloves: ['Here.', 'My hands are freezing now.'],
    shoes: ['Finally, these were killing me.', 'Sorry about the smell.', 'Mind the mud.', 'There.'],
    socks: ['The floor is so cold.', 'Brr. Okay.', 'Ugh, these were soaked.'],
    outer: ['Here. It is heavy.', 'Careful, it is old.', 'Okay, take it.'],
    top_f: ["Do I have to? ...Okay. Please don't stare.", "This is... really embarrassing.", "Can you at least look away for a second?", "Oh god. Okay. Okay."],
    top_m: ['Fine.', 'Here.', "It's cold in here, you know."],
    bottom_f: ["My skirt too? Seriously...", "Please... this is humiliating.", "Don't look. Please don't look.", "I can't believe this..."],
    bottom_m: ['Really? ...Fine.', "This is awkward.", 'Okay, okay. No laughing.'],
    onepiece_f: ["That's... all I'm wearing.", "Please, make it quick. I'm begging you.", "I feel so exposed..."],
    onepiece_m: ["That's everything I've got on.", 'Really? Alright...'],
    last: ["...Happy now?", "Is that everything? I'm freezing.", "Please just get this over with.", "I've never felt so exposed."],
  },
};
// tank patients and questions are interspersed with idle chatter while waiting
export const IDLE_CHATTER = ['How much longer?', 'Is it always this chilly in here?', 'Do you get many people through here?', '...', 'I could really use some water.', 'Nice place. Very... clean.'];

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
