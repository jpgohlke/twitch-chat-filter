// ==UserScript==
// @name        Twitch Plays Pokemon Chat Filter
// @namespace   https://github.com/jpgohlke/twitch-chat-filter
// @description Hide input commands from the chat.

// @include     /^https?://(www|beta)\.twitch\.tv\/(twitchplayspokemon(/(chat.*)?)?|chat\/.*channel=twitchplayspokemon.*)$/

// @version     2.9
// @updateURL   http://jpgohlke.github.io/twitch-chat-filter/chat_filter.meta.js
// @downloadURL http://jpgohlke.github.io/twitch-chat-filter/chat_filter.user.js
// @grant       none
// @run-at      document-end
// ==/UserScript==

/*
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is furnished
 * to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/*
 * chat_filter.user.js
 *
 * Feel free to review/compress it yourself; good internet security is important!
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
 *     /u/MKody
 *     /u/feha
 *     /u/jakery2
 *     /u/redopium
 *     /u/codefusion
 *     /u/Zephymastyx
 *     /u/anonveggy
 *     /u/rctgamer3
 *     /u/BBQCalculator
 */


// ******************
//  CODING GUIDELINES
// ******************

// - Make sure that the code passes JSHint (http://www.jshint.com)
// - Write all code inside the wrapper IIFE to avoid creating global variables.
// - Constants and global variables are UPPER_CASE.

/* jshint 
    lastsemic:true,
    eqeqeq:true,
    sub:true
*/
/* global 
    $: false,
    localStorage: false,
    App: false,
    Twitch: false,
*/

(function(code){
"use strict";

    // ----------------------------
    // Greasemonkey support
    // ----------------------------
    // Greasemonkey userscripts run in a separate environment and cannot use global
    // variables from the page directly. Vecause of this, we package all out code inside
    // a script tag and have it run in the context of the main page.

    // TODO: is there a way to get better error messages? It won't show any line numbers.

    var s = document.createElement('script');
    s.appendChild(document.createTextNode(
       '(' + code.toString() + '());'
    ));
    document.body.appendChild(s);

}(function(){
"use strict";

if (!window.$) { return; }

var TCF_VERSION = "2.9" ;
var TCF_INFO = "TPP Chat Filter version " + TCF_VERSION + " loaded. Please report bugs and suggestions to https://github.com/jpgohlke/twitch-chat-filter";

// ============================
// Array Helpers
// ============================

function forEach(xs, f){
    for(var i=0; i<xs.length; i++){
        f(xs[i], i, xs);
    }
}

function any(xs, pred){
    for(var i=0; i<xs.length; i++){
        if(pred(xs[i])) return true;
    }
    return false;
}

function all(xs, pred){
   for(var i=0; i<xs.length; i++){
        if(!pred(xs[i])) return false;
   }
   return true;
}

function forIn(obj, f){
    for(var k in obj){
        if(Object.prototype.hasOwnProperty.call(obj, k)){
            f(k, obj[k]);
        }
    }
}

function str_contains(string, pattern){
    string = string.toLowerCase();
    return (string.indexOf(pattern.toLowerCase()) >= 0);
}

// ============================
// Initialization code
// ============================

var tcf_initializers = [];

function add_initializer(init){
    tcf_initializers.push(init);
}

function run_initializers(){
    forEach(tcf_initializers, function(init){
        init();
    });
}

// ============================
// Configuration Settings
// ============================

var REQUIRED_SETTING_PARAMS = [
    'name',     // Unique identifier for the setting,
                // used to store it persistently or to generate CSS classes
    'comment',  // Short description of the setting
    'category', // What menu to put this setting under
    'defaultValue' // Can be either boolean or list of strings.
];

var OPTIONAL_SETTING_PARAMS = [
    'longComment', // Longer description that shows when you hover over.
    
    'message_filter',  // When active, filter new chat messages using this predicate
    'message_css',     // When active, modify the existing chat lines with these CSS rules.
    'message_rewriter' // When active, replace the text of the message with the result of this function

];

function Setting(kv){
    // Check for required parameters and typos:
    forEach(REQUIRED_SETTING_PARAMS, function(param){
        if(!(param in kv)){
            throw new Error("Missing param " + param);
        }
    });
    forIn(kv, function(param){
        if(
            REQUIRED_SETTING_PARAMS.indexOf(param) < 0 &&
            OPTIONAL_SETTING_PARAMS.indexOf(param) < 0
        ){
            throw new Error("Unexpected param " + param);
        }
    });
    
    // Initialize members
    
    var that = this;
    forIn(kv, function(key, val){
        that[key] = val;
    });
    
    this._value = null;
    this._observers = [];
}

Setting.prototype.getValue = function(){
    if(this._value !== null){
        return this._value;
    }else{
        return this.defaultValue;
    }
};

Setting.prototype.setValue = function(value){
    var oldValue = this.getValue();
    this._value = value;
    var newValue = this.getValue();
    
    forEach(this._observers, function(obs){
        obs(newValue, oldValue);
    });
};

Setting.prototype.reset = function(){
    this.setValue(null);
};

Setting.prototype.observe = function(onChange){
    this._observers.push(onChange);
};

Setting.prototype.forceObserverUpdate = function(){
    var value = this.getValue();
    forEach(this._observers, function(obs){
        obs(value, value);
    });
};


var TCF_SETTINGS_LIST = [];
var TCF_SETTINGS_MAP  = {};

var TCF_FILTERS   = [];
var TCF_REWRITERS = [];
var TCF_STYLERS   = [];

function add_setting(kv){
    var setting = new Setting(kv);
    
    TCF_SETTINGS_LIST.push(setting);
    TCF_SETTINGS_MAP[setting.name] = setting;
    
    if(setting.message_filter  ){ TCF_FILTERS.push(setting); }
    if(setting.message_css     ){ TCF_STYLERS.push(setting); }
    if(setting.message_rewriter){ TCF_REWRITERS.push(setting); }
}

function get_setting_value(name){
    return TCF_SETTINGS_MAP[name].getValue();
}


// ----------------------------
// Persistence
// ----------------------------

var STORAGE_KEY = "tpp-chat-filter-settings";

var LEGACY_FILTERS_KEY = "tpp-custom-filter-active";
var LEGACY_PHRASES_KEY = "tpp-custom-filter-phrases";

function get_local_storage_item(key){
    var item = localStorage.getItem(key);
    return (item ? JSON.parse(item) : null);
}

function set_local_storage_item(key, value){
    localStorage.setItem(key, JSON.stringify(value));
}

function get_old_saved_settings(){
    //For compatibility with older versions of the script.
    
    var persisted = {};
    
    var old_filters = get_local_storage_item(LEGACY_FILTERS_KEY);
    if(old_filters){
        forIn(TCF_SETTINGS_MAP, function(name){
            forEach(["filters", "rewriters", "stylers"], function(category){
                if(old_filters[category].indexOf(name) >= 0){
                    persisted[name] = true;
                }
            });
        });
    }
    
    var old_banned_phrases = get_local_storage_item(LEGACY_PHRASES_KEY);
    if(old_banned_phrases){
        persisted['TppBanCustomWords'] = true;
        persisted['TppBannedWords'] = old_banned_phrases;
    }
    
    return persisted;
}

function load_settings(){
    var persisted;
    if(window.localStorage){
        persisted = get_local_storage_item(STORAGE_KEY) || get_old_saved_settings();
    }else{
        persisted = {};
    }
    
    forIn(TCF_SETTINGS_MAP, function(name, setting){
        if(name in persisted){
            setting.setValue(persisted[name]);
        }else{
            setting.setValue(null);
        }
    });
}

function save_settings(){
    if(!window.localStorage) return;
    
    var persisted = {};
    forIn(TCF_SETTINGS_MAP, function(name, setting){
        if(setting._value !== null){
            persisted[name] = setting._value;
        }
    });
    
    set_local_storage_item(STORAGE_KEY, persisted);
    localStorage.removeItem(LEGACY_FILTERS_KEY);
    localStorage.removeItem(LEGACY_PHRASES_KEY);
}

add_initializer(function(){
    forEach(TCF_SETTINGS_LIST, function(setting){
        setting.observe(function(){
            save_settings();
        });
    });
});

// ============================
// UI
// ============================

var CHAT_ROOM_SELECTOR = '.chat-room';
var CHAT_MESSAGE_SELECTOR = '.message';
var CHAT_FROM_SELECTOR = '.from';
var CHAT_LINE_SELECTOR = '.chat-line';

var CHAT_TEXTAREA_SELECTOR = ".chat-interface textarea";
var CHAT_BUTTON_SELECTOR = "button.send-chat-button";

function add_custom_css(parts){
    $('head').append('<style>' + parts.join("") + '</style>');
}


// ============================
// Features
// ============================
// In this part we define all the settings and filters that we support
// and all code that needs to run when the script gets initialized.


// ---------------------------
// Command Filter
// ---------------------------

var TPP_COMMANDS = [
    "left", "right", "up", "down",
    "start", "select",
    "a", "b",
    "l", "r",
    "democracy", "anarchy", "wait"
];

var EDIT_DISTANCE_TRESHOLD = 2;

// Adapted from https://gist.github.com/andrei-m/982927
// Compute the edit distance between the two given strings
function min_edit(a, b) {

    if(a.length === 0) return b.length;
    if(b.length === 0) return a.length;

    var matrix = [];
    var i,j;

    // increment along the first column of each row
    for(i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // increment each column in the first row
    for(j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for(i = 1; i <= b.length; i++) {
        for(j = 1; j <= a.length; j++) {
            if(b.charAt(i-1) === a.charAt(j-1)){
                matrix[i][j] = matrix[i-1][j-1];
            } else {
                matrix[i][j] = 1 + Math.min(
                    matrix[i-1][j-1], // substitution
                    matrix[i][j-1]  , // insertion
                    matrix[i-1][j]    // deletion
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

function word_is_command(word){
    return any(TPP_COMMANDS, function(cmd){
        return min_edit(cmd.toLowerCase(), word.toLowerCase()) <= EDIT_DISTANCE_TRESHOLD;
    });
}

function message_is_command(message){
    //Touch pad coordinates
    if(/^([0-9]+),([0-9]+)$/.test(message.replace(/\s/g, ""))){ return true }

    // Button presses
    return all(message.split(/\s+/), function(word){
        if(word.length <= 0){ return true }
        //For compatibility with possible changes the streamer might introduce in the future,
        //a command is considered to be a sequence of command words separated by some non-word separators
        var commands = word.match(/(?:([a-z]+)[^a-z]{0,2})+/ig);
        return commands && all(commands, function(cmd){
            var segments = cmd.match(/[a-z]+/ig);
            return all(segments, word_is_command);
        });
    });
}

add_setting({
    name: 'TppFilterCommand',
    comment: "Emulator commands",
    longComment: TPP_COMMANDS.join(", "),
    category: 'filters_category',
    defaultValue: true,
    
    message_filter: message_is_command
});

// ---------------------------
// Misty meme
// ---------------------------
// Score-based filter for "Guys, we need to beat Misty" spam.

var MISTY_SUBSTRINGS = [
    "misty",
    "whitney",
    "milk",
    "guys",
    "we have to",
    "we need to",
    "beat"
];

function message_is_misty(message) {
    var misty_score = 0;
    forEach(MISTY_SUBSTRINGS, function(s){
        if(str_contains(message, s)){
            misty_score++;
        }
    });
    return (misty_score >= 2);
}

add_setting({
    name: 'TppFilterMisty',
    comment: 'Misty meme',
    longComment : "Guys we need to milk Witney",
    category: 'filters_category',
    defaultValue: true,
    
    message_filter: message_is_misty
});

// ---------------------------
// Hitler drawings
// ---------------------------

function message_is_drawing(message){
    var nonASCII = 0;
    for(var i = 0; i < message.length; i++) {
        var c = message.charCodeAt(i);
        if(9600  <= c && c <= 9632){
            nonASCII++;
        }
    }
    return (nonASCII > 3);
}

add_setting({
    name: 'TppFilterAscii',
    comment: "Blocky drawings",
    longComment: "Stuff like this: \u2591\u2591\u2591\u2591\u2592\u2592\u2592\u2592\u258C \u2580\u2592\u2580\u2590\u2584\u2588",
    category: 'filters_category',
    defaultValue: true,
    
    message_filter: message_is_drawing
});

// ---------------------------
// Cyrillic
// ---------------------------
// Some people use cyrillic characters to write spam that gets past the other filters.

function message_is_cyrillic(message){
    //Some people use cyrillic characters to write spam that gets past the filter.
    return /[\u0400-\u04FF]/.test(message);
}

add_setting({
    name: 'TppFilterCyrillic',
    comment: 'Cyrillic',
    longComment : "Cyrillic characters in copypastas confuse our other filters",
    category: 'filters_category',
    defaultValue: true,
    
    message_filter: message_is_cyrillic
});

// ---------------------------
// Dongers
// ---------------------------

//typical unicodes of dongers (mostly eyes)
var DONGER_CODES = [3720, 9685, 664, 8362, 3232, 176, 8248, 8226, 7886, 3237];

function message_is_donger(message){
    var donger_count = 0;
    for(var i = 0; i < message.length; i++) {
        var c = message.charCodeAt(i);
        if(DONGER_CODES.indexOf(c) >= 0) {
            donger_count++;
        }
    }
    return (donger_count > 1);
}

add_setting({
    name: 'TppFilterDonger',
    comment: "Dongers",
    longComment: "\u30FD\u0F3C\u0E88\u0644\u035C\u0E88\u0F3D\uFF89",
    category: 'filters_category',
    defaultValue: false,
    
    message_filter: message_is_donger
});

// ---------------------------
// One-word messages
// ---------------------------

function message_is_small(message){
    return message.split(/\s/g).length <= 1;
}

add_setting({
    name: 'TppFilterSmall',
    comment: "One-word messages",
    category: 'filters_category',
    defaultValue: false,

    message_filter: message_is_small
});

// ---------------------------
// Walls of text
// ---------------------------
// For messages that fill up more than 4 lines

function message_is_too_long(message){
    return (message.length >= 200);
}
  
add_setting({
    name: 'TppFilterLong',
    comment: 'Overly long messages',
    longComment: "Hide messages over 200 characters (around 4 lines)",
    category: 'filters_category',
    defaultValue: false,
    
    message_filter: message_is_too_long
});

// ---------------------------
// Pokemon Stadium betting
// ---------------------------
// Filter betting commands for the parallel pokemon stadium betting game

function message_is_bet(message){
    return /^\s*\!/.test(message);
}

add_setting({
    name: 'TppFilterBets',
    comment: "Stadium bets",
    longComment: "Any message starting with a \"!\". ex.: \"!bet 100 blue\"",
    category: 'filters_category',
    defaultValue: true,
    
    message_filter: message_is_bet
});

// ---------------------------
// Pokemon Stadium bank bot
// ---------------------------
// Filter bank bot messages for the parallel pokemon stadium betting game

var logged_in_user_name = null;

add_initializer(function(){
    if(Twitch){
        logged_in_user_name = Twitch.user.displayName();
    }
});

function message_is_bank_bot(message, from){
    if(from.toLowerCase() === 'tppbankbot'){
        if(logged_in_user_name){
            // Filter messages not mentioning logged in user
            return message.toLowerCase().indexOf('@'+logged_in_user_name.toLowerCase()) < 0;
        } else {
            // Filter all messages
            return true;
        }
    }
    return false;
}

add_setting({
    name: 'TppFilterBankBot',
    comment: "Stadium bank bot",
    longComment: "Messages from the bank bot about other players' balances",
    category: 'filters_category',
    defaultValue: true,
    
    message_filter: message_is_bank_bot
});

// ---------------------------
// Copy-paste rewriter
// ---------------------------
// Replace repetitive text with only one instance of it.
// Useful for when people do ctrl-c ctrl-v ctrl-v ctrl-v
// in order to increase the size of the message.

function rewrite_copy_paste(message){
    return message.replace(/(.{4}.*?)(\s*?\1)+/g, "$1");
}

add_setting({
    name: 'TppRewriteDuplicates',
    comment: "Copy pasted repetitions",
    category: 'rewriters_category',
    defaultValue: true,
    
    message_rewriter: rewrite_copy_paste
});

// ---------------------------
// Zalgo text
// ---------------------------
//removes unicode characters that are used to cover multiple lines (Oops I spilled my drink)

function mop_up_drinks(message){
    return message.replace(/[\u0300-\u036F]/g, '');
}

add_setting({
    name: 'TppMopUpDrinks',
    comment: "Mop up spilled drinks",
    category: 'rewriters_category',
    defaultValue: true,
    
    message_rewriter: mop_up_drinks
});

// ---------------------------
// Lowercase converter
// ---------------------------

add_setting({
    name: 'TppConvertAllcaps',
    comment: "Lowercase everything",
    longComment: null,
    category: 'visual_category',
    defaultValue: true,
    
    message_css: CHAT_MESSAGE_SELECTOR + "{text-transform:lowercase !important;}"
});

// ---------------------------
// Hide emoticons
// ---------------------------

var emoticon_regexes = [];

add_initializer(function(){
    if(Twitch){
        Twitch.api.get("chat/emoticons").then(function(data){
            forEach(data.emoticons, function(d){
                var regex = d.regex;
                if(regex.match(/^\w+$/)){
                    regex = '\\b' + regex + '\\b';
                }
                emoticon_regexes.push(new RegExp(regex, 'g'));
            });
        });
    }
});

function message_is_only_emoticons(message){
    //Detect if a message would look empty if we got rid of all emoticons.

    var withoutEmoticons = message;
    forEach(emoticon_regexes, function(regexp){
        withoutEmoticons = withoutEmoticons.replace(regexp, "");
    });
    
    return (/^\s*$/.test(withoutEmoticons));
}

add_setting({
    name: 'TppHideEmoticons',
    comment: "Hide emoticons",
    category: 'visual_category',
    defaultValue: false,
    
    message_css: CHAT_MESSAGE_SELECTOR + " .emoticon{display:none !important;}",
    message_filter: message_is_only_emoticons
});

// ---------------------------
// Uncolor messages
// ---------------------------

add_setting({
    name: 'TppNoColor',
    comment: "Uncolor messages",
    longComment: 'Remove color from messages created with the /me command',
    category: 'visual_category',
    defaultValue: false,
    
    message_css: CHAT_MESSAGE_SELECTOR + " {color:inherit !important;}"
});

// ---------------------------
// Banned Words
// ---------------------------

function message_contains_banned_word(message){
    var shouldBan   = get_setting_value('TppBanCustomWords');
    var bannedWords = get_setting_value('TppBannedWords');
    return shouldBan && any(bannedWords, function(banned){
        return str_contains(message, banned);
    });
}

add_setting({
    name: 'TppBanCustomWords',
    comment: "Activate custom banlist",
    longComment: "",
    category: 'customs_category',
    defaultValue: false,
    
    message_css: "#menu-TppBannedWords { display:inherit; }"
});

add_initializer(function(){
    add_custom_css([
        "#menu-TppBannedWords { display:none; }"
    ]);
});

add_setting({
    name: 'TppBannedWords',
    comment: "Banned Phrases",
    longComment: "If the custom banlist is activated, these messages will be hidden",
    category: 'customs_category',
    defaultValue: [],
    
    message_filter: message_contains_banned_word
});


// ============================
// Settings Control Panel
// ============================

//var SETTINGS_BUTTON_SELECTOR = "button.settings";
var SETTINGS_MENU_SELECTOR   = ".chat-settings";

add_initializer(function(){

    add_custom_css([
        ".chat-room { z-index: inherit !important; }",
        ".chat-settings { z-index: 100 !important; }",
        
        ".custom_list_menu li {background: #bbb; display: block; list-style: none; margin: 1px 0; padding: 0 2px}",
        ".custom_list_menu li a {float: right;}"
    ]);

    var settingsMenu = $(SETTINGS_MENU_SELECTOR);

    // Add a scrollbar to the settings menu if its too long
    // We need to dynamically update the menu height because its a sibling of the
    // chat-room div, not its immediate child.
    var chat_room = $(CHAT_ROOM_SELECTOR);
    settingsMenu.css("overflow-y", "auto");
    function updateMenuHeight(){
        var h = chat_room.height();
        if(h > 0){
           //If we call updateMenuHeight too soon, we might get a
           // height of zero and would end up hiding the menu 
           settingsMenu.css("max-height", 0.9 * h);
       }
    }
    updateMenuHeight();
    setInterval(updateMenuHeight, 500); //In case the initial update cant see the real height yet.
    $(window).resize(updateMenuHeight);


    function addBooleanSetting(menuSection, option){
    
        menuSection.append(
            $('<label>').attr('for', option.name).attr('title', option.longComment || "")
            .append( $('<input type="checkbox">').attr('id', option.name) )
            .append( document.createTextNode(' ' + option.comment) )
        );
 
        var checkbox = $('#' + option.name);
        
        checkbox.on('change', function(){
            option.setValue( $(this).prop("checked") );
        });

        option.observe(function(newValue){
            checkbox.prop('checked', newValue);
        });
    }
    
    function addListSetting(menuSection, option){
    
        menuSection
        .append(
            $('<label>').attr('for', option.name).attr('title', option.longComment || "")
            .append( document.createTextNode('Add ' + option.comment) )
            .append( $('<input type="text">').attr('id', option.name).css('width', '100%') )
        ).append(
            $('<button>').attr('id', 'show-' + option.name)
            .append( document.createTextNode('Show ') )
            .append( $('<span>').attr('id', 'num-banned-' + option.name) )
            .append( document.createTextNode(' ' + option.comment) )
        ).append(
            $('<button>').attr('id', 'hide-' + option.name)
            .append( document.createTextNode('Hide ' + option.comment) )
        ).append(
            $('<div class="custom_list_menu">').attr('id', 'list-' + option.name)
        ).append(
            $('<button>').attr('id', 'clear-' + option.name)
           .append( document.createTextNode('Clear ' + option.comment) )
        );
        
        function add_list_item(item){
            var arr = option.getValue().slice();
            if(arr.indexOf(item) < 0){
                arr.push(item);
                option.setValue(arr);
            }
        }
        
        function remove_list_item(i){
            var arr = option.getValue().slice();
            arr.splice(i, 1);
            option.setValue(arr);
        }
        
        function hide_inner_list(){
            $('#show-'+option.name).show();
            $('#hide-'+option.name).hide();
            $('#clear-'+option.name).hide();
            $('#list-'+option.name).hide();
        }

        function show_inner_list(){
            $('#show-'+option.name).hide();
            $('#hide-'+option.name).show();
            $('#clear-'+option.name).show();
            $('#list-'+option.name).show();
        }

        hide_inner_list();

        option.observe(function(newValue){
            $('#num-banned-'+option.name).text(newValue.length);
            
            var innerList = $('#list-' + option.name);
            
            innerList.empty();
            forEach(newValue, function(word, i){
                innerList.append(
                    $("<li>")
                    .text(word)
                    .append(
                        $('<a href="#">')
                        .text("[X]")
                        .click(function(){ remove_list_item(i) })
                    )
                );

            });
        });
        
        //Add new banned item when user hits enter
        $('#' + option.name).keyup(function(e){
            var item = $(this).val().trim();
            if(e.keyCode === 13 && item !== ""){
                add_list_item(item);
                $(this).val('');
            }
        });
        
        //open the list of banned items
        $('#show-' + option.name).click(function(e){
            e.preventDefault();
            show_inner_list();
        });
        
        //close the list of banned items
        $('#hide-' + option.name).click(function(e){
            e.preventDefault();
            hide_inner_list();
        });
        
        //empty the banned list completely
        $('#clear-' + option.name).click(function(e){
            e.preventDefault();
            option.setValue([]);
        });
    }

    function addMenuSection(name){
        $('<div class="list-header"/>')
            .text(name)
            .appendTo(settingsMenu);
        
        var section = $('<div class="chat-menu-content">')
            .appendTo(settingsMenu);
        
        return section;
    }
    
    function addCategoryToSection(menuSection, category){
        forEach(TCF_SETTINGS_LIST, function(option){
            if(option.category !== category) return;
            
            var p = $('<p>')
                .attr('id', 'menu-'+option.name)
                .addClass('dropmenu_action')
                .appendTo(menuSection);
            
            var typ = typeof(option.defaultValue);
            if(typ === 'boolean'){
                addBooleanSetting(p, option);
            }else if(typ === 'object'){
                addListSetting(p, option);
            }else{
                throw new Error("Unrecognized setting " + typ);
            }
        });
    }

    var filter_sec = addMenuSection("Hide");
    addCategoryToSection(filter_sec, 'filters_category');
    
    var rewrite_sec = addMenuSection("Automatically rewrite");
    addCategoryToSection(rewrite_sec, 'rewriters_category');
    
    var visual_sec = addMenuSection("Visual tweaks");
    addCategoryToSection(visual_sec, 'visual_category');
    
    var custom_sec = addMenuSection("Custom Banlist");
    addCategoryToSection(custom_sec, 'customs_category');

    var misc_sec = addMenuSection("Misc");
    misc_sec.append(
        $('<button>Reset TPP filter settings</a>')
        .click(function(){
            if(confirm("This will reset all Twitch Chat Filter settings to their default values and will delete all custom banned phrases. Are you sure you want to continue?")){
                forEach(TCF_SETTINGS_LIST, function(setting){
                    setting.reset();
                });
            }
        })
    );
    
});


// ============================
// Chat Stylers
// ============================

add_initializer(function(){
    var customCSS = [];      
    forEach(TCF_STYLERS, function(setting){
        customCSS.push(CHAT_ROOM_SELECTOR+"."+setting.name+" "+setting.message_css);
    });

    add_custom_css(customCSS);
    
    forEach(TCF_STYLERS, function(setting){
        setting.observe(function(newValue){
            $(CHAT_ROOM_SELECTOR).toggleClass(setting.name, newValue);
        });
    });
});

// ============================
// Chat Filtering
// ============================

function matches_filters(message, from){
    var matches = {};
    forEach(TCF_FILTERS, function(setting){
        matches[setting.name] = setting.message_filter(message, from);
    });
    return matches;
}

function rewrite_with_active_rewriters(message, from){
    var newMessage = message;
    forEach(TCF_REWRITERS, function(setting){
        if(setting.getValue()){
            newMessage = (setting.message_rewriter(newMessage, from) || newMessage);
        }
    });
    return newMessage;
}

add_initializer(function(){
    // Filter toggles
    var customCSS = [];
    forEach(TCF_FILTERS, function(setting){
        var filter = setting.name;
        var toggle = setting.name + "Hidden";
        customCSS.push(CHAT_ROOM_SELECTOR+"."+toggle+" "+CHAT_LINE_SELECTOR+"."+filter+"{display:none}");

        setting.observe(function(){
            $(CHAT_ROOM_SELECTOR).toggleClass(toggle, setting.getValue());
        });
    });
    add_custom_css(customCSS);
});

add_initializer(function(){
    var View_proto = require("web-client/views/line")["default"].prototype;

    // New lines
    var original_didInsertElement = View_proto.didInsertElement;
    View_proto.didInsertElement = function() {
        original_didInsertElement.apply(this, arguments);

        var view = this.$();
        var matches = matches_filters(this.get("context.model.message"), this.get("context.model.from"));
        for (var filter in matches) {
            view.toggleClass(filter, matches[filter]);
        }
    };

    // Existing lines
    $(CHAT_LINE_SELECTOR).each(function(){
        var chatLine = $(this);
        var chatText = chatLine.find(CHAT_MESSAGE_SELECTOR).text().trim();
        var chatFrom = chatLine.find(CHAT_FROM_SELECTOR).text().trim();
        forEach(TCF_FILTERS, function(setting) {
            chatLine.toggleClass(setting.name, setting.message_filter(message, from));
        });
    });
});

// ============================
// Slowmode Helper
// ============================

var slowmode_antiflicker_ms   = 1000;  // How long to wait for Twitch to respond to our message before updating the UI
var slowmode_rate_limit_sec   = 2;     // How often can we send a new message
var slowmode_repeat_limit_sec = 30;    // How long we need to wait before being able to send a repeated message.

var slowmode_last_action_time = null;  // We temporarily disable everything after sending a message to avoid flickering
var slowmode_last_message = null;      // We need to know our last message to account for "repeated message" slowmode
var slowmode_prev_message = null;      // The repeated message slowmode cares about the last *accepted* message that we sent.
                                       // When sending a new message, we backup the old one in case the new one gets blocked.

var slowmode_banned_until_time = null; // Twitch can issue temporary bans for breaking slowmode or using too much ALLCAPS.

function update_slowmode_last_message(message_text){
    var now = Date.now();
    slowmode_last_action_time = now;
    slowmode_prev_message = slowmode_last_message;
    slowmode_last_message = {text:message_text, time:now};
}

function unsend_last_message(){
    slowmode_last_message = slowmode_prev_message;
    slowmode_prev_message = null;
}

function update_slowmode_with_admin_message(admin_text){
    var regex_result;
    if(/now in slow mode/.test(admin_text)){
        regex_result = /(\d+) second/.exec(admin_text);
        if(regex_result){
            if(slowmode_rate_limit_sec == Number(regex_result[1])) return false;
            slowmode_rate_limit_sec = Number(regex_result[1]);
        }
    }
    if(/identical to the previous/.test(admin_text)){
        regex_result = /than (\d+) second/.exec(admin_text);
        if(regex_result){
            slowmode_repeat_limit_sec = Number(regex_result[1]);
        }
        unsend_last_message();
    }
    if(/you are sending messages too quickly/.test(admin_text)){
        regex_result = /in (\d+) second/.exec(admin_text);
        if(regex_result){
            var next_message_seconds = Number(regex_result[1]);
            var slowmode_miliseconds = (Date.now() - slowmode_last_message.time) + 1000 * next_message_seconds;
            slowmode_rate_limit_sec = Math.ceil(slowmode_miliseconds / 1000);
        }
        unsend_last_message();
    }
    if(/You are banned/.test(admin_text)){
        regex_result = /for (\d+) more second/.exec(admin_text);
        if(regex_result){
            var remaining_ban_seconds = Number(regex_result[1]);                    
            slowmode_banned_until_time = Date.now() + 1000 * remaining_ban_seconds;
        }
        unsend_last_message();
    }
    update_slowmode_ui();
    return true;
}

function slowmode_status(next_message){
    var now = Date.now();

    if(slowmode_banned_until_time){
        var ban_wait = slowmode_banned_until_time - now;
        if(ban_wait > 0){
            return {blocked : true, error : "you are banned", wait : ban_wait};
        }
    }

    if(slowmode_last_message){
    
        var antiflicker_wait = slowmode_last_action_time + slowmode_antiflicker_ms - now;
        if(antiflicker_wait > 0){
            return {blocked : true, error : "", wait : null};
        }
    
        if(next_message === slowmode_last_message.text){
            var repeat_wait = slowmode_last_message.time + 1000 * slowmode_repeat_limit_sec - now;
            if(repeat_wait > 0){
                return {blocked:true, error:"repeated message", wait : repeat_wait};
            }
        }
        
        var rate_wait = slowmode_last_message.time + 1000 * slowmode_rate_limit_sec - now;
        if(rate_wait > 0){
            return {blocked:true, error:"slowmode", wait : rate_wait};
        }
    }
    
    return {blocked:false};
}

var SLOWMODE_UPDATE_MS = 500;
var SLOWMODE_CLASS = 'tpp-slowmode-warning';

var chat_button_original_text = null;
var button_is_default = true;

function update_slowmode_ui(){
    var next_message = $(CHAT_TEXTAREA_SELECTOR).val();
    var status = slowmode_status(next_message);
    var button = $(CHAT_BUTTON_SELECTOR);
    
    if(get_setting_value("TppSlowmodeHelper") && status.blocked){
        var warning;
        if(status.error){
            warning = "Wait " + Math.ceil(status.wait/1000) + " seconds (" + status.error + ")";
        }else{
            warning = "...";
        }
        
        button.addClass(SLOWMODE_CLASS);
        button.text(warning);
        button_is_default = false;
    }else{
        if(!button_is_default){ //Prevent flickering when debugging.
            button.removeClass(SLOWMODE_CLASS);
            button.text(chat_button_original_text);
            button_is_default = true;
        }
    }
}

add_initializer(function(){
    chat_button_original_text = $(CHAT_BUTTON_SELECTOR).text();
    
    add_custom_css([
        "."+SLOWMODE_CLASS + "{ opacity:0.7 !important}"
    ]);
    
    $(CHAT_TEXTAREA_SELECTOR).keyup(function(e){
        if(e.keyCode !== 13){ update_slowmode_ui(); }
    });
  
    setInterval(function(){ update_slowmode_ui() }, SLOWMODE_UPDATE_MS);
});

add_setting({
    name: 'TppSlowmodeHelper',
    comment: "Slowmode helper",
    longComment: "Shows a countdown of how long you need to wait until being able to chat again",
    category: 'visual_category',
    defaultValue: true
});

// ============================
// Incoming message monitoring
// ============================

add_initializer(function(){

    var Room_proto = require("web-client/models/room")["default"].prototype;

    var original_addMessage = Room_proto.addMessage;
    Room_proto.addMessage = function(info) {
        if(info.style === "admin"){
            if(!update_slowmode_with_admin_message(info.message)){ return false }
        }else{
            // Apply rewriters to future messages
            info.message = rewrite_with_active_rewriters(info.message, info.from);
        }
        
        return original_addMessage.apply(this, arguments);
    };

    var original_send = Room_proto.send;
    Room_proto.send = function(message){
        update_slowmode_last_message(message);
        return original_send.apply(this, arguments);
    };
});

// ============================
// Main
// ============================

// Initialize when chat view is inserted
var ChatView_proto = require("web-client/views/chat")["default"].prototype;
var original_didInsertElement = ChatView_proto.didInsertElement;
ChatView_proto.didInsertElement = function(){

original_didInsertElement && original_didInsertElement.apply(this, arguments);

run_initializers();
load_settings();

console.log(TCF_INFO);

};

}));
