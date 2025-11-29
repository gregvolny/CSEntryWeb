// RunApl.cpp: implementation of the CRunApl class.
//
//////////////////////////////////////////////////////////////////////
#include "StdAfx.h"
#include "runapl.h"

#ifdef _DEBUG
#undef THIS_FILE
static char THIS_FILE[]= __FILE__;
#define new DEBUG_NEW
#endif
#include <ZBRIDGEO/npff.h>

//////////////////////////////////////////////////////////////////////
// Construction/Destruction
//////////////////////////////////////////////////////////////////////
CRunApl::CRunApl()
{
    m_pPifFile = NULL;

    m_bFlagAppLoaded = false;
    m_bFlagStart = false;
    SetAppMode( CRUNAPL_NONE );
}

CRunApl::~CRunApl()
{
    Stop();
    End();
}

// Compile. true if OK
bool CRunApl::LoadCompile()
{
#ifdef __EMSCRIPTEN__
    printf("[CRunApl::LoadCompile] Starting... m_pPifFile=%p\n", (void*)m_pPifFile);
    fflush(stdout);
#endif

    if(m_pPifFile->GetApplication()->IsCompiled()){ //SAVY 03 May 2002
#ifdef __EMSCRIPTEN__
        printf("[CRunApl::LoadCompile] IsCompiled=true, setting m_bFlagAppLoaded=false\n");
        fflush(stdout);
#endif
        m_bFlagAppLoaded  = false;
    }

#ifdef __EMSCRIPTEN__
    printf("[CRunApl::LoadCompile] m_bFlagAppLoaded=%d\n", m_bFlagAppLoaded);
    fflush(stdout);
#endif

    if( m_bFlagAppLoaded )
        return false;

    else
        m_bFlagAppLoaded = true;

#ifdef __EMSCRIPTEN__
    printf("[CRunApl::LoadCompile] Returning true\n");
    fflush(stdout);
#endif

    return true;
}

// Inform to engine that application was finished.
bool CRunApl::End() {
    if( !m_bFlagAppLoaded )
        return( false );
    m_bFlagAppLoaded = false;

    return( true );
}


// Open Dat/IDX. Let's ready to run.
bool CRunApl::Start()
{
    if( !m_bFlagAppLoaded )
        return( false );

    if( m_bFlagStart )
        return( false );
    else
        m_bFlagStart = true;

    return( true );
}

// Closes DAT/IDX and LST.
bool CRunApl::Stop() {
    if( !m_bFlagStart )
        return( false );
    m_bFlagStart = false;

    return( true );
}
