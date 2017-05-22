const restify = require('restify');
const builder = require('botbuilder');
const request = require('request');

//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, () => {
    console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

//=========================================================
// Bots Middleware
//=========================================================

// Anytime the major version is incremented any existing conversations will be restarted.
bot.use(builder.Middleware.dialogVersion({ version: 1.0, resetCommand: /^reset/i }));

//=========================================================
// Bots Global Actions
//=========================================================

bot.endConversationAction('goodbye', 'Goodbye :)', { matches: /^goodbye/i });
bot.beginDialogAction('help', '/help', { matches: /^help/i });

//=========================================================
// Bots Dialogs
//=========================================================

bot.dialog('/menu', [
    function (session) {
        builder.Prompts.choice(session, "What demo would you like to run?", "prompts|actions|(quit)");
    },
    function (session, results) {
        if (results.response && results.response.entity != '(quit)') {
            // Launch demo dialog
            session.beginDialog('/' + results.response.entity);
        } else {
            // Exit the menu
            session.endDialog();
        }
    },
    function (session, results) {
        // The menu runs a loop until the user chooses to (quit).
        session.replaceDialog('/menu');
    }
]).reloadAction('reloadMenu', null, { matches: /^menu|show menu/i });

bot.dialog('/help', [
    function (session) {
        session.endDialog("Please send me a picture so that I can determine its hotdogness.\n\nGlobal commands that are available anytime:\n\n* menu - Exits a demo and returns to the menu.\n* goodbye - End this conversation.\n* help - Displays these commands.");
    }
]);

bot.dialog('/', [
    (session) => {

        if (session.message.attachments.length === 0) {
            // No image sent, remind user to upload
            session.replaceDialog('/help');
        }
        else {

            // Process uploaded image(s)

            // Loop through all uploaded photos and check if they are, in fact, hotdogs
            let counter = 0;
            session.message.attachments.forEach((attachment, index) => {

                // Grab image url from the session attachment
                let imageUrl = `${session.message.attachments[index].contentUrl}`;

                // Cognitive Services options
                let options = {
                    url: `https://westus.api.cognitive.microsoft.com/vision/v1.0/analyze?language=en&visualFeatures=Categories,Description,Tags`,
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'Ocp-Apim-Subscription-Key': process.env.COGNITIVE_SERVICES_KEY
                    },
                    method: 'POST',
                    encoding: 'binary',
                    json: true
                };

                // Get the image file then pipe into a request to Cognitive Services
                request
                    .get(imageUrl)
                    .pipe(request.post(options, (error, response, body) => {

                        // Check if image is of a hotdog per the returned tags
                        if (body.description.tags.indexOf('hotdog') === -1 && body.description.tags.indexOf('hot') === -1 && body.description.tags.indexOf('dog') === -1) {
                            // Not a hotdog. So sad.  

                            // Create a response card
                            var card = new builder.HeroCard(session)
                                .title('Not a hotdog!!!')
                                .text(`Looks more like ${body.description.captions[0].text}`)
                                .images([
                                    builder.CardImage.create(session, response.request.src.href)
                                ]);

                            // Create a message
                            var msg = new builder.Message(session).addAttachment(card);

                            // Send message
                            session.send(msg);

                        }
                        else {
                            // Eureka! Hotdog!

                            // Create a response card
                            var card = new builder.HeroCard(session)
                                .title('Hotdog!!!')
                                .images([
                                    builder.CardImage.create(session, response.request.src.href)
                                ]);

                            // Create a message
                            var msg = new builder.Message(session).addAttachment(card);

                            // Send message
                            session.send(msg);

                        }

                        // Iterate counter
                        counter++;
                        if (counter === session.message.attachments.length) { session.endDialog(); }

                    }));

            });

        }

    }

]);