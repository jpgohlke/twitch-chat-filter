// ==UserScript==
// @name        Twitch Plays Pokemon Chat Filter
// @namespace   https://github.com/jpgohlke/twitch-chat-filter
// @description Hide input commands from the chat.

// @include     /^https?://(www|beta)\.twitch\.tv\/(twitchplayspokemon(/(chat.*)?)?|chat\/.*channel=twitchplayspokemon.*)$/

// @version     2.3
// @updateURL   http://jpgohlke.github.io/twitch-chat-filter/chat_filter.user.js
// @grant       unsafeWindow
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
    unsafeWindow:false
*/

(function(){
"use strict";

var TCF_VERSION = "2.3" ;
var TCF_INFO = "TPP Chat Filter version " + TCF_VERSION + " loaded. Please report bugs and suggestions to https://github.com/jpgohlke/twitch-chat-filter";

// ----------------------------
// Greasemonkey support
// ----------------------------
// Greasemonkey userscripts run in a separate environment and cannot use global
// variables from the page directly. They need to be accessed via `unsafeWindow`

var myWindow;
try{
    myWindow = unsafeWindow;
}catch(e){
    myWindow = window;
}

var $ = myWindow.jQuery;

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

function get_setting(name){
    return TCF_SETTINGS_MAP[name];
}


// ----------------------------
// Persistence
// ----------------------------

var STORAGE_KEY = "tpp-chat-filter-settings";

var LEGACY_FILTERS_KEY = "tpp-custom-filter-active";
var LEGACY_PHRASES_KEY = "tpp-custom-filter-phrases";

function get_local_storage_item(key){
    var item = window.localStorage.getItem(key);
    return (item ? JSON.parse(item) : null);
}

function set_local_storage_item(key, value){
    window.localStorage.setItem(key, JSON.stringify(value));
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
var CHAT_LINE_SELECTOR = '.chat-line';

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
    var segments = message.match(/[A-Za-z]+/g);
    return segments && all(segments, function(segment){
        return (segment === "") || word_is_command(segment);
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
    "beat",
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
    comment: "Blocky Drawings",
    longComment: "Stuff like this: ░░░░▒▒▒▒▌ ▀▒▀▐▄█",
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
    longComment: "ヽ༼ຈل͜ຈ༽ﾉ",
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

add_setting({
    name: 'TppHideEmoticons',
    comment: "Hide emoticons",
    category: 'visual_category',
    defaultValue: false,
    
    message_css: CHAT_MESSAGE_SELECTOR + " .emoticon{display:none !important;}",
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
    var shouldBan   = get_setting('TppBanCustomWords').getValue();
    var bannedWords = get_setting('TppBannedWords').getValue();
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
    comment: "Banned Words",
    longComment: "If the custom banlist is activated, these messages will be hidden",
    category: 'customs_category',
    defaultValue: [],
    
    message_filter: message_contains_banned_word
});


// ============================
// Settings Control Panel
// ============================

add_initializer(function(){

    add_custom_css([
        ".chat-room { z-index: inherit !important; }",
        ".tpp-settings { z-index: 100 !important; }",
        
        ".custom_list_menu {background: #aaa; border:1px solid #000; position: absolute; right: 2px; bottom: 2px; padding: 10px; display: none; width: 150px;}",
        ".custom_list_menu li {background: #bbb; display: block; list-style: none; margin: 1px 0; padding: 0 2px}",
        ".custom_list_menu li a {float: right;}",
        ".tpp-custom-filter {position: relative;}"
    ]);
    
    var controlButton = $('<button id="chat_filter_dropmenu_button" class="button-simple light tooltip"/>')
        .css('margin-left', '5px')
        .css('background-image', 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAAv0lEQVQ4jc3SIQ7CQBAF0C8rK5E9AhI5R1gccpLOn+UACARHwCO5Aq6HQHAUQsAhwJGmlNBdIOEnY18mfwb4u4hIYWaSOySnAABVrWKMt9xx97OqVlDVkbufPoAuZiYAgBBC6e5NBnJQ1eqpK5KbBKQJIZQvyyc5f4eQ3A66pJlJjLG3N3dfJr0FyUUHudZ1PUtCWls9IDPbJyN90OBeulHV8beg6lfQKgsSkaJ18qOZTbIgAHD3NcmdiBTZSGruBIYOSjStwb0AAAAASUVORK5CYII=)')
        .css('background-position', '3px 3px')
        .attr('title', 'Chat Filter Settings')
        .insertAfter('button.viewers');

    // Make room for extra button by shrinking the chat button
    $('.send-chat-button').css('left', '90px');

    // Create menu
    var controlPanel = $('<div id="chat_filter_dropmenu">')
        .addClass('chat-settings chat-menu tpp-settings')
        .css('display', 'none')
        .appendTo('.chat-interface');
    
    controlButton.on('click', function(){
        controlPanel.toggle();
    });

    function addBooleanSetting(menu, option){
        menu.append(
            '<label class="filter_option" for="' + option.name + '"' + 
                (option.longComment ? ' title="' + option.longComment + '"' : '') +
                '>' +
                '<input type="checkbox" id="' + option.name + '">' +
                ' ' + option.comment +
            '</label>' 
        );

        var checkbox = $('#' + option.name);
        
        checkbox.on('change', function(){
            option.setValue( $(this).prop("checked") );
        });

        option.observe(function(newValue){
            checkbox.prop('checked', newValue);
        });
    }
    
    function addListSetting(menu, option){
        menu.append(
            '<label class="filter_option" for="' + option.name + '"' + 
                (option.longComment ? ' title="' + option.longComment + '"' : '') +
                ' >'+
                'Add ' + option.comment + 
                '<input type="text" id="' + option.name + '" style="width: 100%">'+
            '</label>' + 

            '<a href="#" id="show-' + option.name + '">' +
                'Show <span id="num-banned-' + option.name + '"> ?? </span> ' + option.comment+
            '</a>' + 
        
            '<div class="custom_list_menu" id="list-' + option.name + '">' +
                '<b>' + option.comment + '</b>' +
                '<div class="list-inner"></div>' + 
                '<div><a href="#" id="clear-' + option.name + '">Clear list</a></div>' +
                '<div><a href="#" id="close-' + option.name + '">Close</a></div>' +
            '</div>'
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
        
        option.observe(function(newValue){
            $('#num-banned-'+option.name).text(newValue.length);
            
            var innerList = $('#list-' + option.name + ' .list-inner');
            
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
            $('#list-' + option.name).show();
        });
        
        //close the list of banned items
        $('#close-' + option.name).click(function(e){
            e.preventDefault();
            $('#list-' + option.name).hide();
        });
        
        //empty the banned list completely
        $('#clear-' + option.name).click(function(e){
            e.preventDefault();
            option.setValue([]);
        });
    }

    function addMenuSection(name, category){
      
        $('<div class="chat-menu-header"/>')
            .text(name)
            .appendTo(controlPanel);
        
        var section = $('<div>')
            .addClass("chat-menu-content")
            .appendTo(controlPanel);
            
        forEach(TCF_SETTINGS_LIST, function(option){
            if(option.category !== category) return;
            
            var p = $('<p>')
                .attr('id', 'menu-'+option.name)
                .addClass('dropmenu_action')
                .appendTo(section);
            
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
    
    addMenuSection("Hide"                 , 'filters_category');
    addMenuSection("Automatically rewrite", 'rewriters_category');
    addMenuSection("Visual"               , 'visual_category'); 
    addMenuSection("Custom Filters"       , 'customs_category');
    
    $('<a href="#">Reset to default settings</a>')
    .click(function(){    
        forEach(TCF_SETTINGS_LIST, function(setting){
            setting.reset();
        });
    })
    .appendTo(controlPanel);
    
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

function passes_active_filters(message){
    return all(TCF_FILTERS, function(setting){
        return !(setting.getValue() && setting.message_filter(message));
    });
}

function rewrite_with_active_rewriters(message){
    var newMessage = message;
    forEach(TCF_REWRITERS, function(setting){
        if(setting.getValue()){
            newMessage = (setting.message_rewriter(newMessage) || newMessage);
        }
    });
    return newMessage;
}

add_initializer(function(){
    // Apply filters to existing messages
    // (Cannot do the same with rewriters)
    forEach(TCF_FILTERS, function(setting){
        setting.observe(function(){
            $(CHAT_LINE_SELECTOR).each(function(){
                var chatLine = $(this);
                var chatText = chatLine.find(CHAT_MESSAGE_SELECTOR).text().trim();
                chatLine.toggle( passes_active_filters(chatText) );
            });
        });
    });
});

// ============================
// Slowmode Helper
// ============================

var SLOWMODE_CLASS = 'tpp-slowmode-warning';

var last_input = false;
var backup_last_input = false;
var input_time_limit = 2;
var time_since_last_message = 0;
var previous_time_since_last_message = 0;
var same_input_time_limit = 30;
var input_countdown = 0;
var banned_time = 0;
var same_input_countdown = 0;
var interval_id;
var current_input = "";
var input_disabled;
var textarea_elem = ".ember-text-area";
var button_elem = ".send-chat-button button";

function countdown_input(){
    input_countdown = input_countdown > 0 ? input_countdown - 1 : 0;
    same_input_countdown = same_input_countdown > 0 ? same_input_countdown - 1 : 0;
    banned_time = banned_time > 0 ? banned_time - 1 : 0;
    time_since_last_message += 1;
    update_button();
    //Only clear Interval if *all* countdowns hit 0
    //Potentially, the user might pass the regular 20 second limit, then enter his old message and get the 30 second countdown back
    //I am not overthinking this, am I?
    if(input_countdown <= 0 && same_input_countdown <= 0 && banned_time <= 0){
        clearInterval(interval_id);
        input_disabled = false;
    }
}

function update_button(){
    var is_same_input = $(textarea_elem).val() === last_input;
    var relevant_countdown = is_same_input ? same_input_countdown : input_countdown;
    if(banned_time > 0) relevant_countdown = banned_time;
    var button = $(button_elem);
    if(relevant_countdown <= 0)
    {
        button
        .text("Chat")
        .removeClass(SLOWMODE_CLASS)
        .removeAttr("disabled");
        input_disabled = false;
    }
    else
    {
        disable_button(relevant_countdown);
        var countdown_text = "Wait " + relevant_countdown + " seconds";
        if(banned_time > 0) countdown_text += " (banned)";
        else if(is_same_input) countdown_text += " (repeated message)";
        button.text(countdown_text);
    }
}

function disable_button(seconds){
    $(button_elem)
        .addClass(SLOWMODE_CLASS)
        .text("Wait " + seconds + " seconds")
        .attr("disabled", "disabled");
    input_disabled = true;
}

function renew_interval(){
    if(interval_id) clearInterval(interval_id);
    interval_id = setInterval(function(){countdown_input()}, 1000);
}

function update_slowmode_last_message(){
    current_input = $(textarea_elem).val();
    if(current_input.trim() === '') return;
    backup_last_input = last_input;
    last_input = current_input;
    current_input = false;
    disable_button(input_time_limit);
    input_countdown = input_time_limit;
    same_input_countdown = same_input_time_limit;
    previous_time_since_last_message = time_since_last_message;
    time_since_last_message = 0;
    renew_interval();
}

function update_slowmode_with_admin_message(admin_text){
    var regex_result;
    if(/now in slow mode/.test(admin_text)){
        regex_result = /every (\d+) second/.exec(admin_text);
        if(regex_result){
            //hide slow mode messages with no new time limit
            if(input_time_limit === parseInt(regex_result[1])) return "";
            input_time_limit = parseInt(regex_result[1]);
        }
    }
    if(/identical to the previous/.test(admin_text)){
        regex_result = /than (\d+) second/.exec(admin_text);
        if(regex_result){
            same_input_time_limit = parseInt(regex_result[1]);
            //if we get here, we set a time limit even though the last message was not sent.
            //This happens because the same input countdown seems to be randomly between 30 and 35 seconds
            
            same_input_countdown = 5;
            input_countdown = 0;
            input_disabled = true;
            time_since_last_message = previous_time_since_last_message;
            update_button();
            renew_interval();
            
            return "Your last message could not be sent. Please try again shortly.";
        }
    }
    if(/slow mode and you are sending/.test(admin_text)){
        regex_result = /again in (\d+) second/.exec(admin_text);
        if(regex_result){
            var seconds = parseInt(regex_result[1]);
            //revert some stuff because the message we thought we sent was not sent
            input_disabled = true;
            time_since_last_message = previous_time_since_last_message;
            input_countdown = seconds;
            last_input = backup_last_input;
            update_button();
            
            //calculate new time limit
            input_time_limit = time_since_last_message + seconds;
            renew_interval();
            
            return "Your last message could not be sent due to the current slow mode time limit. Button timer is now updated with correct time limit.";
        }
    }
    if(/You are banned/.test(admin_text)){
        regex_result = /for (\d+) more second/.exec(admin_text);
        if(regex_result){
            banned_time = parseInt(regex_result[1]);
            renew_interval();
        }
    }
    return admin_text;
}

add_initializer(function(){
    
    add_custom_css([
        "."+SLOWMODE_CLASS + "{ opacity:0.7 !important}"
    ]);

    $(textarea_elem).keyup(function(e){
        if(e.keyCode !== 13) update_button();
    });
});

// ============================
// Incoming message monitoring
// ============================

add_initializer(function(){
    var Room_proto = myWindow.App.Room.prototype;

    var original_addMessage = Room_proto.addMessage;
    Room_proto.addMessage = function(info) {
        if(info.style === "admin"){
            update_slowmode_with_admin_message(info.message);
        }else{
            // Apply filters and rewriters to future messages
            info.message = rewrite_with_active_rewriters(info.message);
            if(!passes_active_filters(info.message)){ return false }
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

$(function(){

// Fallback to old script if new chat is not supported.
if($("button.viewers").length <= 0){
    //The user is not using the latest version of Twitch chat;
    //Fallback to an older version of the filtering script.
    
    //I don't know if any users actuall still have the old chat.
    //This code is here just due to paranoia...
    
    var tag = document.createElement('script');
    tag.type = 'text/javascript';
    tag.src = 'http://jpgohlke.github.io/twitch-chat-filter/chat_filter_old.user.js';
    document.body.appendChild(tag);
    throw new Error('Falling back to old filter script');
}

run_initializers();
load_settings();

console.log(TCF_INFO);

});

}()); // End wrapper IIFE
