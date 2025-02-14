/*
| Handles the git calls.
*/
const aspawn = require( './aspawn' );

// git binary to call
const gitBinary = '/usr/bin/git';

/*
| Clones a repository from a file url.
|
| ~gitDir: directory of the bare repository.
| ~baseDir: parent dir to clone to.
*/
const clone =
	async function( gitDir, baseDir )
{
	try{
		await aspawn( gitBinary, [ 'clone', gitDir ] , { cwd: baseDir } );
	} catch (err) {
		console.log("[error]", err)
	}
};

/*
| Creates a bare repository.
*/
const init =
	async function( dir )
{
	try{
		await aspawn( gitBinary, [ 'init', '--bare' ] , { cwd: dir } );
	} catch (err) {
		console.log("[error]", err)
	}
};

/*
| Pulls a repository.
*/
const pull =
	async function( dir )
{	
	try{
		await aspawn( gitBinary, [ 'pull', '--no-edit' ] , { cwd: dir } );
	} catch (err) {
		console.log("[error]", err)
	}
};

/*
| Stages, commits and pushes.
|
| Currently all git errors are ignored, some need to like "nothing to commit",
| some might require better handling.
*/
const save =
	async function( count, dir, message )
{
	console.log( count, 'git staging all changes' );
	try { await aspawn( '/usr/bin/git', [ 'add', '--all' ], { cwd: dir }); }
	catch( e ) { console.log( e ); }

	console.log( count, 'git commit' );
	try { await aspawn( '/usr/bin/git', [ 'commit', '-m', message ], { cwd: dir }); }
	catch( e ) { console.log( e ); }

	console.log( count, 'git push' );
	try { await aspawn( '/usr/bin/git', [ 'push' ], { cwd: dir } ); }
	catch( e ) { console.log( e ); }
};

/*
| Exports.
*/
module.exports =
{
	clone: clone,
	init: init,
	pull: pull,
	save: save,
};
