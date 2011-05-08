var async = require("async"),
	request = require("request"),
	spawn = require("child_process").spawn,
	fs = require("fs"),
	configFile = "./config.json",
	iostat= null;

if(process.argv > 2){
	configFile = process.argv[2];
}

var devices = {};
var resultCount = 0;

async.waterfall(
	[
		function(callback){
			fs.readFile(configFile,"utf8",callback);
		},
		function(data,callback){
			var config = JSON.parse(data);
			callback(!config,config);
		}
	],
	function(err,config){
		if(err){
			console.log(err);
			process.exit();
			return;
		}

		for(var deviceName in config.device){
			devices[deviceName] = {};

			for(var propName in config.device[deviceName]){
				devices[deviceName][propName] = 0;
			}
		}
		
		setTimeout(updatePachube,config.feed.update,config);

		iostat = spawn("iostat",["-d",config.feed.interval,"-x"]);

		var lines = [];
		var first = true;

		iostat.stdout.on("data",function(data){
			var parts = data.toString().split("\n");
			for(var partIdx in parts){
				var part = parts[partIdx];

				/*Blank line after data indicates new result*/
				if(part == "" && lines.length > 0){
					if(first){
						first = false;
						lines = [];
					}else{
						processResult(lines,config);
						lines = [];
					}
				}else if(part != ""){
					lines.push(part);
				}
			}
		});

		iostat.on("exit",function(){
			process.exit();
		});
	}
);


function processResult(lines,config){
	var keys = [];
	var stat = {}

	for(var lineIdx in lines){
		var line = lines[lineIdx];

		var parts = line.split(/\s+/);
		
		if(parts[0] == "Device:"){
			keys = parts;
		}else{
			var obj = {};
			for(var i = 1;i < parts.length;i++){
				obj[keys[i]] = parts[i];
			}

			stat[parts[0]] = obj;
		}
	}

	resultCount++;

	for(var devName in devices){
		if(stat[devName]){
			for(var propertyName in devices[devName]){
				devices[devName][propertyName] += parseFloat(stat[devName][propertyName]);
			}
		}
	}
}

function updatePachube(config){

	var requestLines = [];

	if(resultCount > 0){

		for(var devName in devices){
			for(var propName in devices[devName]){
				requestLines.push(config.device[devName][propName] + "," + devices[devName][propName] / resultCount);
				devices[devName][propName] = 0;
			}
		}

		resultCount = 0;

		var requestOptions = {};

		requestOptions.uri = "http://api.pachube.com/v2/feeds/" + config.feed.id + ".csv";
		requestOptions.method = "PUT"
		requestOptions.body = requestLines.join("\r\n");
		requestOptions.headers = {
			'HOST' : "api.pachube.com",
			'Content-Type' : 'text/csv',
			'Content-Length' : requestOptions.body.length,
			'X-PachubeApiKey' : config.feed.apiKey
		};

		request(requestOptions,function(err,res,body){
			if(err){
				console.log(err);
			}
			setTimeout(updatePachube,config.feed.update,config);
		});
	}
}

