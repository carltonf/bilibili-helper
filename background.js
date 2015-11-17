var notification = false,
	notificationAvid = {},
	playerTabs = {},
	cidHackType = {},
	viCache = {},
	locale = 0,
	localeAcquired = false,
	localeTimeout = null,
	secureAvailable = false,
	videoPlaybackHosts = ["http://*.hdslb.com/*"];

URL.prototype.__defineGetter__('query', function() {
	var parsed = this.search.substr(1).split('&');
	var parsedObj = {};
	parsed.forEach(function(elem, iter, arr) {
		var vals = arr[iter].split('=');
		parsedObj[vals[0]] = vals[1];
	});
	return parsedObj;
});

var randomIP = function(fakeip) {
	var ip_addr = '220.181.111.';
	if (fakeip == 2) ip_addr = '59.152.193.';
	ip_addr += Math.floor(Math.random() * 254 + 1);
	return ip_addr;
}

function getFileData(url, callback) {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open("GET", url, true);
	xmlhttp.onreadystatechange = function() {
		if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
			if (typeof callback == "function") callback(xmlhttp.responseText);
		} else if (xmlhttp.readyState == 4 && xmlhttp.status > 400) {
			if (typeof callback == "function") callback("{}");
		}
	}
	xmlhttp.send();
}

function postFileData(url, data, callback) {
	var encodeData = "",
		append = false;
	Object.keys(data).forEach(function(key) {
		if (!append) {
			append = true;
		} else {
			encodeData += "&";
		}
		encodeData += encodeURIComponent(key).replace(/%20/g, "+") + "=" +
			encodeURIComponent(data[key]).replace(/%20/g, "+");
	});
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open("POST", url, true);
	xmlhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
	xmlhttp.onreadystatechange = function() {
		if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
			if (typeof callback == "function") callback(xmlhttp.responseText);
		}
	}
	xmlhttp.send(encodeData);
}

function getUrlVars(url) {
	var vars = [],
		hash;
	var hashes = url.slice(url.indexOf('?') + 1).split('&');
	for (var i = 0; i < hashes.length; i++) {
		hash = hashes[i].split('=');
		vars.push(hash[0]);
		vars[hash[0]] = hash[1];
	}
	return vars;
}

function searchBilibili(info) {
	chrome.tabs.create({
		url: "http://www.bilibili.com/search?keyword=" + info.selectionText
	});
}

function notifyAllTabs(message) {
	chrome.windows.getAll({
		populate: true
	}, function(wins) {
		wins.forEach(function(win) {
			win.tabs.forEach(function(tab) {
				chrome.tabs.sendMessage(tab.id, message);
			});
		});
	});
}

function updateAll() {
	notifyAllTabs({
		command: "update"
	});
}

function enableAll() {
	setOption("enabled", true);
	updateAll();
}

function disableAll() {
	setOption("enabled", false);
	updateAll();
}

function checkDynamic() {
	if (getOption("dynamic") == "on") {
		getFileData("http://interface.bilibili.com/widget/getDynamic?pagesize=1", function(data) {
			var dynamic = JSON.parse(data);
			if (typeof dynamic === "object" && typeof dynamic.num === "number") {
				var content = dynamic.list[0];
				if (content.dyn_id != parseInt(getOption("lastDyn"))) {
					if (notification) chrome.notifications.clear("bh-" + notification, function() {});
					notification = (new Date()).getTime();
					var message = chrome.i18n.getMessage('followingUpdateMessage')
						.replace('%n', dynamic.num)
						.replace('%uploader', content.dyn_type == 'SPECIAL_ADDBANGUMI' ? '搬' : content.uname)
						.replace('%title', content.dyn_type == 'SPECIAL_ADDBANGUMI' ? content.stitle : content.title),
						icon = content.cover ? content.cover : "imgs/icon-256.png";
					notificationAvid["bh-" + notification] = content.aid;
					chrome.notifications.create("bh-" + notification, {
						type: "basic",
						iconUrl: icon,
						title: chrome.i18n.getMessage('noticeficationTitle'),
						message: message,
						isClickable: false,
						buttons: [{
							title: chrome.i18n.getMessage('notificationWatch')
						}, {
							title: chrome.i18n.getMessage('notificationShowAll')
						}]
					}, function() {});
					setOption("lastDyn", content.dyn_id);
				}
				if (content.dyn_id == parseInt(getOption("lastDyn"))) {
					setOption("updates", 0);
					chrome.browserAction.setBadgeText({
						text: ""
					});
				} else {
					setOption("updates", dynamic.num);
					chrome.browserAction.setBadgeText({
						text: getOption("updates")
					});
				}
			}
		});
	}
}

function resolvePlaybackLink(avPlaybackLink, callback) {
	if (!avPlaybackLink || !avPlaybackLink.durl || !avPlaybackLink.durl[0] || !avPlaybackLink.durl[0].url) {
		if (typeof callback == "function") callback(avPlaybackLink);
		return false;
	}
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open("HEAD", avPlaybackLink.durl[0].url, true);
	xmlhttp.onreadystatechange = function() {
		if (xmlhttp.readyState == 4) {
			var url = xmlhttp.responseURL || avPlaybackLink.durl[0].url;
			var videoHost = new URL(url).origin + '/*';
			if (videoPlaybackHosts.indexOf(videoHost) < 0) {
				videoPlaybackHosts.push(videoHost);
				resetVideoHostList();
			}
			avPlaybackLink.durl[0].url = url;
			if (typeof callback == "function") callback(avPlaybackLink);
		}
	}
	xmlhttp.send();
}

function getVideoInfo(avid, page, callback) {
	page = parseInt(page);
	var currTime = parseInt(new Date().getTime() / 1000);
	if (isNaN(page) || page < 1) page = 1;
	if (typeof viCache[avid + '-' + page] != "undefined" && currTime - viCache[avid + '-' + page]['ts'] <= 3600) {
		callback(viCache[avid + '-' + page], true);
		return true;
	}
	getFileData("http://api.bilibili.com/view?type=json&appkey=95acd7f6cc3392f3&id=" + avid + "&page=" + page + "&batch=true", function(avInfo) {
		avInfo = JSON.parse(avInfo);
		if (typeof avInfo.code != "undefined" && avInfo.code == -503) {
			setTimeout(function() {
				getVideoInfo(avid, page, callback);
			}, 1000);
		} else {
			if (typeof avInfo.list == "object") {
				avInfo.pages = avInfo.list.length;
				for (var i = 0; i < avInfo.pages; i++) {
					if (avInfo.list[i].page == page) {
						avInfo.cid = avInfo.list[i].cid;
						break;
					}
				}
			}
			if (typeof avInfo.cid == "number") {
				viCache[avid + '-' + page] = {
					mid: avInfo.mid,
					tid: avInfo.tid,
					cid: avInfo.cid,
					pic: avInfo.pic,
					pages: avInfo.pages,
					title: avInfo.title,
					sp_title: avInfo.sp_title,
					spid: avInfo.spid,
					season_id: avInfo.season_id,
					created_at: avInfo.created_at,
					description: avInfo.description,
					tag: avInfo.tag,
					ts: currTime
				};
			}
			callback(avInfo, false);
		}
	});
	return true;
}

function checkSecurePlayer() {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open("HEAD", "https://static-s.bilibili.com/play.swf", true);
	xmlhttp.onreadystatechange = function() {
		if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
			secureAvailable = xmlhttp.getResponseHeader('Content-Type') == 'application/x-shockwave-flash';
		}
	}
	xmlhttp.send();
}

chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {
	switch (request.command) {
		case "init":
			sendResponse({
				replace: getOption("replace"),
				html5: getOption("html5"),
				version: version,
				playerConfig: JSON.parse(getOption("playerConfig"))
			});
			return true;
		case "cidHack":
			playerTabs[sender.tab.id] = request.cid;
			cidHackType[request.cid] = request.type;
			sendResponse();
			return true;
		case "getOption":
			sendResponse({
				value: getOption(request.key)
			});
			return true;
		case "enableAll":
			enableAll();
			sendResponse({
				result: "ok"
			});
			return true;
		case "disableAll":
			disableAll();
			sendResponse({
				result: "ok"
			});
			return true;
		case "getCSS":
			if (getOption("enabled") == "true" || getOption("ad") != "keep") sendResponse({
				result: "ok",
				css: getCSS(request.url)
			});
			else sendResponse({
				result: "disabled"
			});
			return true;
		case "getVideoInfo":
			getVideoInfo(request.avid, request.pg, function(avInfo) {
				sendResponse({
					videoInfo: avInfo
				});
			});
			return true;
		case "getDownloadLink":
			var url = {
				download: "http://interface.bilibili.com/playurl?platform=bilihelper&otype=json&appkey=95acd7f6cc3392f3&cid=" + request.cid + "&quality=4&type=" + getOption("dlquality"),
				playback: "http://interface.bilibili.com/playurl?platform=bilihelper&otype=json&appkey=95acd7f6cc3392f3&cid=" + request.cid + "&quality=4&type=mp4"
			};
			if (request.cidHack && request.cidHack != locale) {
				cidHackType[request.cid] = request.cidHack;
			}
			getFileData(url["download"], function(avDownloadLink) {
				avDownloadLink = JSON.parse(avDownloadLink);
				if (getOption("dlquality") == 'mp4') {
					if (avDownloadLink)
						resolvePlaybackLink(avDownloadLink, function(avRealPlaybackLink) {
							sendResponse({
								download: avDownloadLink,
								playback: avRealPlaybackLink,
								dlquality: getOption("dlquality"),
								rel_search: getOption("rel_search")
							});
						})
				} else {
					getFileData(url["playback"], function(avPlaybackLink) {
						avPlaybackLink = JSON.parse(avPlaybackLink);
						resolvePlaybackLink(avPlaybackLink, function(avRealPlaybackLink) {
							sendResponse({
								download: avDownloadLink,
								playback: avRealPlaybackLink,
								dlquality: getOption("dlquality"),
								rel_search: getOption("rel_search")
							});
						})
					});
				}
			});
			return true;
		case "getMyInfo":
			getFileData("http://api.bilibili.com/myinfo", function(myinfo) {
				myinfo = JSON.parse(myinfo);
				if (typeof myinfo.code == undefined) myinfo.code = 200;
				sendResponse({
					code: myinfo.code || 200,
					myinfo: myinfo
				});
			});
			return true;
		case "searchVideo":
			var keyword = request.keyword;
			getFileData("http://api.bilibili.com/search?type=json&appkey=95acd7f6cc3392f3&keyword=" + encodeURIComponent(keyword) + "&page=1&order=ranklevel", function(searchResult) {
				searchResult = JSON.parse(searchResult);
				if (searchResult.code == 0) {
					sendResponse({
						status: "ok",
						result: searchResult.result[0]
					});
				} else {
					sendResponse({
						status: "error",
						code: searchResult.code,
						error: searchResult.error
					});
				}
			});
			return true;
		case "checkComment":
			getFileData("http://www.bilibili.com/feedback/arc-" + request.avid + "-1.html", function(commentData) {
				var test = commentData.indexOf('<div class="no_more">');
				if (test >= 0) {
					sendResponse({
						banned: true
					});
				} else {
					sendResponse({
						banned: false
					});
				}
			});
			return true;
		case "savePlayerConfig":
			sendResponse({
				result: setOption("playerConfig", JSON.stringify(request.config))
			});
			return true;
		case "sendComment":
			var errorCode = ["正常", "选择的弹幕模式错误", "用户被禁止", "系统禁止",
				"投稿不存在", "UP主禁止", "权限有误", "视频未审核/未发布", "禁止游客弹幕"
			];
			request.comment.cid = request.cid;
			postFileData("http://interface.bilibili.com/dmpost?cid=" + request.cid +
				"&aid=" + request.avid + "&pid=" + request.page, request.comment,
				function(result) {
					result = parseInt(result);
					if (result < 0) {
						sendResponse({
							result: false,
							error: errorCode[-result]
						});
					} else {
						sendResponse({
							result: true,
							id: result
						});
					}
				});
			return true;
		case "linkFilenameInfo":
			sessionStorage.setItem(request.url, request.filename);
			return true;
		default:
			sendResponse({
				result: "unknown"
			});
			return false;
	}
});

if (localStorage.getItem("enabled") == null) {
	enableAll();
}

if (getOption("contextmenu") == "on") {
	chrome.contextMenus.create({
		title: chrome.i18n.getMessage('searchBili'),
		contexts: ["selection"],
		onclick: searchBilibili
	});
}

checkDynamic();

if (window.navigator.userAgent.indexOf('Windows') < 0) {
	checkSecurePlayer();
}

chrome.alarms.create("checkDynamic", {
	periodInMinutes: 1
});

chrome.alarms.create("getLocale", {
	periodInMinutes: 5
});

function getLocale() {
	getFileData("https://freegeoip.net/json/", function(result) {
		try {
			result = JSON.parse(result);
			if (result.country_code) {
				switch (result.country_code) {
					case "CN":
						locale = 1;
						break;
					case "TW":
					case "HK":
					case "MO":
						locale = 2;
						break;
					default:
						locale = 0;
						break;
				}
				localeAcquired = true;
			} else {
				throw "locale undetermined";
			}
		} catch (e) {
			localeTimeout = setTimeout(function() {
				getLocale();
			}, 10000);
		}
	});
}

getLocale();

if (getOption("version") < chrome.app.getDetails().version) {
	setOption("version", chrome.app.getDetails().version);
	chrome.notifications.create('bh-update', {
		type: 'basic',
		iconUrl: "imgs/icon-256.png",
		title: chrome.i18n.getMessage('noticeficationTitle'),
		message: chrome.i18n.getMessage('noticeficationExtensionUpdate').replace('%v', chrome.app.getDetails().version),
		isClickable: false,
		buttons: [{
			title: chrome.i18n.getMessage('noticeficationNewFeatures')
		}]
	}, function() {});
}

chrome.alarms.onAlarm.addListener(function(alarm) {
	switch (alarm.name) {
		case "checkDynamic":
			checkDynamic();
			return true;
		case "getLocale":
			if (!localeAcquired) {
				clearTimeout(localeTimeout);
				getLocale();
			}
			return true;
		default:
			return false;
	}
});

chrome.notifications.onButtonClicked.addListener(function(notificationId, index) {
	if (notificationId == 'bh-update') {
		chrome.tabs.create({
			url: chrome.extension.getURL("options.html#update")
		});
	} else if (index == 0 && notificationAvid[notificationId]) {
		chrome.tabs.create({
			url: "http://www.bilibili.com/video/av" + notificationAvid[notificationId]
		});
	} else if (index == 1) {
		chrome.tabs.create({
			url: "http://www.bilibili.com/account/dynamic"
		});
	}
});

chrome.webRequest.onBeforeRequest.addListener(function(details) {
	chrome.tabs.sendMessage(details.tabId, {
		command: "error"
	});
}, {
	urls: ["http://comment.bilibili.com/1272.xml"]
});

chrome.webRequest.onBeforeRequest.addListener(function(details) {
	if (secureAvailable) {
		return {
			redirectUrl: "https://static-s.bilibili.com/play.swf"
		}
	} else {
		return {};
	};
}, {
	urls: ["http://static.hdslb.com/play.swf"]
}, ["blocking"]);

chrome.webRequest.onBeforeSendHeaders.addListener(function(details) {
	var query = new URL(details.url).query;
	var ip = randomIP(cidHackType[query['cid']] == 2 ? 2 : 1);
	if (locale != cidHackType[query['cid']]) {
		details.requestHeaders.push({
			name: 'X-Forwarded-For',
			value: ip
		}, {
			name: 'Client-IP',
			value: ip
		})
	}
	return {
		requestHeaders: details.requestHeaders
	};
}, {
	urls: ["http://interface.bilibili.com/playurl?cid*", "http://interface.bilibili.com/playurl?accel=1&cid=*", "http://interface.bilibili.com/playurl?platform=bilihelper*", "http://www.bilibili.com/video/av*", "http://www.bilibili.com/bangumi/*", "http://app.bilibili.com/bangumi/*", "http://www.bilibili.com/search*"]
}, ['requestHeaders', 'blocking']);

function receivedHeaderModifier(details) {
	details.responseHeaders.push({
		name: "Access-Control-Allow-Origin",
		value: "http://www.bilibili.com"
	});
	return {
		responseHeaders: details.responseHeaders
	};
};

function resetVideoHostList() {
	if (chrome.webRequest.onHeadersReceived.hasListener(receivedHeaderModifier)) {
		chrome.webRequest.onHeadersReceived.removeListener(receivedHeaderModifier);
	}
	chrome.webRequest.onHeadersReceived.addListener(receivedHeaderModifier, {
		urls: videoPlaybackHosts
	}, ["responseHeaders", "blocking"]);
}

chrome.webRequest.onHeadersReceived.addListener(function(details) {
	var headers = details.responseHeaders;
	if (details.statusLine.indexOf("HTTP/1.1 302") == 0 && getOption("replace") == "on") {
		for (var i = 0; i < headers.length; i++) {
			if (headers[i].name.toLowerCase() == "location") {
				headers.splice(i, 1, {
					name: "Set-Cookie",
					value: "redirectUrl=" + encodeURIComponent(headers[i].value)
				});
			}
		}
	}
	return {
		responseHeaders: headers
	};
}, {
	urls: ["http://www.bilibili.com/video/av*"]
}, ["responseHeaders", "blocking"]);

// Set up downloaded file name
var biliHelperFilenameDeterminer = function(item, __suggest) {
	function suggest(filename, conflictAction) {
		if (filename === undefined){
			__suggest();
		} else {
			__suggest({
				filename: filename,
				conflictAction: conflictAction
			});
		}
	}

	var decentFn = sessionStorage.getItem(item.url),
		fileExt = item.filename.substr(item.filename.lastIndexOf('.') + 1);

	// file extension auto conversion.
	//
	// Some sources are known to give weird file extensions, do our best to
	// convert them.
	switch (fileExt) {
		case "letv":
			fileExt = "flv";
			break;
		default:
			// remain the same, nothing;
	}

	if (decentFn) {
		decentFn = filenameSanitize(decentFn, {
			replacement: '_',
			max: 255 - fileExt.length - 1
		}) + '.' + fileExt;
		suggest(decentFn, 'uniquify');
	} else {
		suggest();
	}
};

var biliHelperFilenameDeterminerIsEnabled = false;

var biliHelperFilenameDeterminerEnabler = function(evtInfo){
	function biliDynamicDownloader(activeTabUrl){
		var matchRes = activeTabUrl.match(/:\/\/(.[^/]+)/);

		// whether it's bilibili site
		if( matchRes &&  matchRes[1] === "www.bilibili.com" ){
			if ( !biliHelperFilenameDeterminerIsEnabled ){
				biliHelperFilenameDeterminerIsEnabled = true;

				chrome.downloads.onDeterminingFilename.addListener(biliHelperFilenameDeterminer);
			}
		} else {
			biliHelperFilenameDeterminerIsEnabled = false;

			chrome.downloads.onDeterminingFilename.removeListener(biliHelperFilenameDeterminer);
		}
	}

	if ( typeof evtInfo === 'number' ){
		// windows.onFocusChanged
		chrome.tabs.query({active: true, currentWindow: true, windowId: evtInfo}, function(tabs){
			// it's possible for some windows to not have tabs (debug console)
			var tab = tabs[0] || {url: ''};
			console.log("onFocusChanged> The newly activated tab is: " + tab.url);

			biliDynamicDownloader(tab.url);
		});
	} else {
		// tabs.onActivated
		chrome.tabs.get(evtInfo.tabId, function(tab){
			console.log("onActivated> The newly activated tab is: " + tab.url);

			biliDynamicDownloader(tab.url);
		});
	}
};

// Every window has its own active tab, switching between windows WON'T trigger "onActivated"
chrome.tabs.onActivated.addListener( biliHelperFilenameDeterminerEnabler );
// When the current window doesn't change, switching tabs WON'T trigger "onFocusChanged"
// However, various actions, i.e. click on a menu, could also trigger this event.
chrome.windows.onFocusChanged.addListener( biliHelperFilenameDeterminerEnabler );
