/*
Permission is hereby granted, free of charge, to any person obtaining a copy 
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights 
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell 
copies of the Software, and to permit persons to whom the Software is furnished 
to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all 
copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A 
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT 
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION 
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE 
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/* 
 * chat_filter.js
 *
 * Feel free to review/compress it yourself; good internet security is important!
 * Compressed by UglifyJS.
 * Passes http://www.jshint.com on default settings
 * Contributors:
 *     /u/RenaKunisaki
 *     /u/smog_alado 
 *     /u/SRS-SRSLY
 *     /u/schrobby
 *     /u/red_agent
 *     /u/DeathlyDeep
 *     /u/jeff_gohlke
 *     /u/yankjenets
 */


/* global $:false, CurrentChat:false */

// --- Script configuration ---

var BLOCKED_WORDS = [
    //Standard Commands
    "left", "right", "up", "down", "start", "select", "a", "b", "democracy", "anarchy",                                                

    //Other spam.
    "oligarchy", "bureaucracy", "monarchy", "alt f4"
];

var MINIMUM_MESSAGE_LENGTH = 3; //For Kappas and other short messages.
var MAXIMUM_NON_ASCII_CHARACTERS = 2; //For donger smilies, etc
var MINIMUM_DISTANCE_ERROR = 2; // Number of insertions / deletions / substitutions away from a blocked word.
var REFRESH_MILLISECONDS = 100;

// --- Filtering ---

// Adapted from https://gist.github.com/andrei-m/982927
// Compute the edit distance between the two given strings
function min_edit(a, b) {
  if(a.length === 0) return b.length; 
  if(b.length === 0) return a.length; 
 
  var matrix = [];
 
  // increment along the first column of each row
  var i;
  for(i = 0; i <= b.length; i++){
    matrix[i] = [i];
  }
 
  // increment each column in the first row
  var j;
  for(j = 0; j <= a.length; j++){
    matrix[0][j] = j;
  }
 
  // Fill in the rest of the matrix
  for(i = 1; i <= b.length; i++){
    for(j = 1; j <= a.length; j++){
      if(b.charAt(i-1) == a.charAt(j-1)){
        matrix[i][j] = matrix[i-1][j-1];
      } else {
        matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, // substitution
                                Math.min(matrix[i][j-1] + 1, // insertion
                                         matrix[i-1][j] + 1)); // deletion
      }
    }
  }
 
  return matrix[b.length][a.length];
}

function applyMinEdit(msg) {
  return function(curr_word) {
    min_edit(curr_word, msg);
  };
}

//This regex recognizes messages that contain exactly a chat command,
//without any extra words around. This includes compound democracy mode
//commands like `up2left4` and `start9`.
// (remember to escape the backslashes when building a regexes from strings!)
var commands_regex = new RegExp("^((" + BLOCKED_WORDS.join("|") + ")\\d?)+$", "i");

var message_is_spam = function(msg){
    "use strict";

    //Ignore spaces
    msg = msg.replace(/\s/g, '');

    if(msg.length < MINIMUM_MESSAGE_LENGTH) return true;

    if(msg.match(commands_regex)) return true;

    //Maps distance function across all blocked words, and then takes the minimum integer in the array.
    var min_distance = BLOCKED_WORDS.map(applyMinEdit).reduce(Math.min);

    if(min_distance <= MINIMUM_DISTANCE_ERROR) return true;

    var nonASCII = 0;
    for(var i = 0; i < msg.length; i++) {
        if(msg.charCodeAt(i) > 127) {
            nonASCII++;
            if(nonASCII > MAXIMUM_NON_ASCII_CHARACTERS){
                return true;
            }
        }
    }

  return false;
};

// --- UI ---

$(
    "<style type='text/css' >" +
        ".segmented_tabs li li a.CommandsToggle {" +
            "width: 50px;" +
            "padding-left: 0;" +
            "padding-top: 0;" +
            "height: 8px;" +
            "line-height: 115%;" +
        "}" +

        ".segmented_tabs li li a.ChatToggle {" +
            "width: 35px;" +
            "padding-left: 15px;" +
            "padding-top: 0;" +
            "height: 8px;" +
            "line-height: 115%;" +
        "}" +

        "#chat_line_list li { display:none }" + // hide new, uncategorized messages

        "#chat_line_list li.fromjtv,"         + // show twitch error messages
        "#chat_line_list.showSpam li.cSpam,"  + // show commands if they toggled on
        "#chat_line_list.showSafe li.cSafe {" + // show non-commands if they are enabled
            "display:inherit;" +
        "}" +
    " </style>"
).appendTo("head");


// Reduce the width of the chat button to fit the extra buttons we will add.
var chat_button = $("ul.segmented_tabs li a").first();
chat_button.css("width", chat_button.width() - 71);

// Add a pair of buttons to toggle the spam on and off.
$("<li><a class='CommandsToggle'>Commands</a><a class='ChatToggle'>Talk</a></li>").insertAfter(chat_button);

$(".CommandsToggle").click(function () {
    $(this).toggleClass("selected");
    $("#chat_line_list").toggleClass("showSpam");
});

$(".ChatToggle").click(function () {
    $(this).toggleClass("selected");
    $("#chat_line_list").toggleClass("showSafe");
// Simulate a click on ChatToggle so it starts in the "on" position.
}).click();

// --- Main ---

//The spam commands still push chat messages out the queue so we 
//increase the buffer size from the default 150 so chat messages
//last a bit longer.
CurrentChat.line_buffer = 800;

setInterval(function () {
    "use strict";

    $('#chat_line_list li:not(.cSpam):not(.cSafe)').each(function() {
        var chatLine = $(this);
        var chatText = chatLine.find(".chat_line").text();
        
        if(message_is_spam(chatText)){
          chatLine.addClass("cSpam");
        }else{
          chatLine.addClass("cSafe");
        }
    });
    
    //Scroll chat appropriately
    if (CurrentChat.currently_scrolling) { 
        CurrentChat.scroll_chat(); 
    }

}, REFRESH_MILLISECONDS);
