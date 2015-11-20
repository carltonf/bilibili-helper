// How to work with template
// ref: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/template

var htmlTemplatesLoader = new Promise(function(resolve, reject){
	$("<div id='bilibili-helper-templates'>").appendTo($('head')).load(
		chrome.extension.getURL("templates/templateSnippets.html"),
		function(responseText, textStatus){
			if (textStatus === 'success'){
				resolve(0);
			}
			else {
				reject(textStatus + ': ' + responseText);
			}
		});
});


// Helper function to return a cloned document fragment
//
// tplSelector: the selector is a CSS selector.
htmlTemplatesLoader.cloneDocFragment = function(tplSelector){
	return document.importNode(document.querySelector(tplSelector).content,
							   true);
};
