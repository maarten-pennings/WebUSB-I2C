/* WebUSB-I2C - entering commands in a web-console to control an I2C slave
** 2018 Jul 22 Maarten Pennings
*/
// Assumes 
//  - Arduino/Genuino Micro 
//  - An I2C slave connected to SCL/pin3 and SDA/pin2 (e.g. an ENS210)
//  - Optionally a FTDI/CH340/CP2101/etc on RX and TX as a debug-console (115200)
// To use
//  - Goto https://webusb.github.io/arduino/demos/console for a webpage with a console 
//  - Click the connect button to connect to the dongle
//  - Type 'h' for help in command-console (or 'v' for version)
#define VERSION "v5"

#include <Wire.h>   // I2C library


// ==== USB ======================================================================================

// WebUSB only works for USB 2.1 and up. Therefore, change USB_VERSION to 0x210 in file
// %AppData%\Local\Arduino15\packages\arduino\hardware\avr\1.6.21\cores\arduino\USBCore.h
// See https://github.com/webusb/arduino, and also see warning on (semi) bricking.
#include <WebUSB.h> 

// Creating an instance of WebUSBSerial will add an additional USB interface to
// the device that is marked as vendor-specific (rather than USB CDC-ACM) and
// is therefore accessible to the browser. The URL is a hint to the browser.
WebUSB WebUSBSerial(1 /* https:// */, "maarten-pennings.github.io");


// ==== Serial ===================================================================================

// Pick one for main output (command-console)
//#define MainSerial Serial        // Serial over USB (use Arduino COM port)
#define MainSerial WebUSBSerial    // Serial over WebUSB
//#define MainSerial Serial1       // Serial over hardware UART 1

// Pick one for debug output (debug-console)
#define DebugSerial Serial       // Serial over USB (use Arduino COM port)
//#define DebugSerial WebUSBSerial // Serial over WebUSB
//#define DebugSerial Serial1        // Serial over hardware UART 1


// ==== Serial: helpers for MainSerial ===========================================================

// Shorthands
#define NL "\r\n"
#define NIBBLE(d) (char)( (d) + ((d)<10?'0':'a'-10) )

// Prints one character to MainSerial
void MainSerial_printchar(char ch) {
  MainSerial.print(ch);
  MainSerial.flush();
}

// Prints one data byte to MainSerial as two lower case hex digits
void MainSerial_printbyte(int d) {
  char s[3] = { NIBBLE(d/16),  NIBBLE(d%16), 0 };
  MainSerial.print(s);
  MainSerial.flush();
}

// Prints a string to MainSerial
void MainSerial_printstr(const char * s) {
  MainSerial.print(s);
  MainSerial.flush();
}


// ==== Serial: helpers for DebugSerial =========================================================

#define PREFIX  "dbg: "
//#define PREFIX  ""

static int DebugSerial_numchars=0;
static int DebugSerial_numdots=0;
static int DebugSerial_dotcalls=0;

// Prints an 'alive' dot
void DebugSerial_dot(void) { 
  if( DebugSerial_dotcalls++<2000 )return; else DebugSerial_dotcalls= 0;

  if( DebugSerial_numchars>0 ) DebugSerial.print("\n");
  if( DebugSerial_numdots==0 ) DebugSerial.print(PREFIX "waiting ..");
  DebugSerial.print(".");  
  DebugSerial_numchars=0;
  DebugSerial_numdots++;
  if( DebugSerial_numdots==60 ) { DebugSerial.print("\n"); DebugSerial_numdots= 0; }
}

// Prints an (asynchronously) incoming char (typed from MainSerial)
void DebugSerial_trace(char ch) { 
  if( DebugSerial_numdots>0 ) DebugSerial.print("\n");
  if( DebugSerial_numchars==0 ) DebugSerial.print(PREFIX "cmd=");
  DebugSerial.print(ch);  
  DebugSerial_numchars++;
  DebugSerial_numdots= 0;
  DebugSerial_dotcalls= 0;
}

// Print a string (with 0 data byte arguments)
void DebugSerial_print0(const char * s1) {
  if( DebugSerial_numchars>0 || DebugSerial_numdots>0 ) DebugSerial.print("\n");
  DebugSerial.print(PREFIX);
  DebugSerial.println(s1);  
  DebugSerial_numchars= 0;
  DebugSerial_numdots= 0;
  DebugSerial_dotcalls= 0;
}

// Print a string (with 1 data  byte argument)
void DebugSerial_print1(const char * s1, int d1, const char * s2) {
  if( DebugSerial_numchars>0 || DebugSerial_numdots>0 ) DebugSerial.print("\n");
  DebugSerial.print(PREFIX);
  DebugSerial.print(s1);
  char sd1[3] = { NIBBLE(d1/16),  NIBBLE(d1%16), 0 };
  DebugSerial.print(sd1);
  DebugSerial.println(s2);
  DebugSerial_numchars= 0;
  DebugSerial_numdots= 0;
  DebugSerial_dotcalls= 0;
}

// Print a string (with 2 data byte arguments)
void DebugSerial_print2(const char * s1, int d1, const char * s2, int d2, const char * s3) {
  if( DebugSerial_numchars>0 ) DebugSerial.print("\n");
  DebugSerial.print(PREFIX);
  DebugSerial.print(s1);
  char sd1[3] = { NIBBLE(d1/16),  NIBBLE(d1%16), 0 };
  DebugSerial.print(sd1);
  DebugSerial.print(s2);
  char sd2[3] = { NIBBLE(d2/16),  NIBBLE(d2%16), 0 };
  DebugSerial.print(sd2);
  DebugSerial.println(s3);
  DebugSerial_numchars= 0;
}


// ==== State management =========================================================================

typedef enum state_e {
  // In these comments:
  //  - lower case is an actual char
  //  - A is any hexchar 0..9,a..f (for a slave address)
  //  - D is any hexchar 0..9,a..f (for a data byte to be written)
  //  - C is any hexchar 0..9,a..f (for a count of bytes to be read)
  //  - X is any of p/w/r, it terminates a segment (p), maybe repeated start (wr), actual transfer of current segment
  state_noconsole,// no console connected yet
  state_prompt,   // print prompt and transition to idle
  state_idle,     // wait for a new transmission (w,r)
  state_wait_wa1, // entered "w", waiting for address nibble 1
  state_wait_wa2, // entered "wA", waiting for address nibble 2
  state_wait_wd1, // entered "wAA" (or "wAADD", "wAADDDD"), waiting for data nibble 1 - or p/w/r to transition to state_wait_wx
  state_wait_wd2, // entered "wAAD", waiting for data nibble 2
  state_wait_wx,  // entered "wAAX", "wAADDX", "wAADDDDX" etc, transferring DDDD, transition to idle, state_wait_wa1, or state_wait_ra1
  state_wait_ra1, // entered "r", waiting for address nibble 1
  state_wait_ra2, // entered "rA", waiting for address nibble 2
  state_wait_rc1, // entered "rAA", waiting for read count nibble 1
  state_wait_rc2, // entered "rAAC", waiting for read count nibble 2
  state_wait_rx,  // entered "rAACC", waiting p/w/r to start transfer, transition to idle, state_wait_wa1, or state_wait_ra1
} state_t;

int ishex(int ch ) { // returns 1 iff ch is (lower case) hex
  return ( '0'<=ch && ch<='9' ) || ( 'a'<=ch && ch<='f' );
}

int hex2dec(int ch) { // converts 0..9,a..f to 0..15; all other chars to -1
  if( '0'<=ch && ch<='9' ) return ch-'0';
  else if( 'a'<=ch && ch<='f' ) return ch-'a';
  else return -1;
}


// ==== Setup/Loop ===============================================================================

// If you have a LED connected to some pin, define LEDPIN, otherwise keep it undefined.
#define LEDPIN 13

state_t state;   // The state of the I2C transaction command
int     ch;      // Character to process

int     addr;    // The value of AA (once entered)
int     data;    // The value of DD (once entered)
int     count;   // The value of CC (once entered)

void setup() {
  // LED
  #ifdef LEDPIN
  pinMode( LEDPIN, OUTPUT);    
  #endif
  
  // In case DebugSerial is Serial over USB, we need a bit of time for it to be enabled
  while( !DebugSerial && !MainSerial && count<200 ) {
    count++;
    delay(50);
    digitalWrite( LEDPIN, ! digitalRead(LEDPIN));
  }

  // Setup DebugSerial
  DebugSerial.begin(115200); 
  DebugSerial.println("");
  DebugSerial.println("");
  DebugSerial_print0("Welcome to WebUSB-I2C " VERSION);
  DebugSerial_print2("USB VERSION ", USB_VERSION >> 8,"", USB_VERSION & 0xFF," (must be >=0210)");

  // I2C
  Wire.begin(); 

  // Set state
  state= state_noconsole; // No console yet (for entering commands)
  ch= -1; // No char to process
  DebugSerial_print0("Waiting for connect from web");
  DebugSerial_print0("Visit e.g. https://webusb.github.io/arduino/demos/console");

  // Toggle LED to show booted
  #ifdef LEDPIN
  digitalWrite( LEDPIN, DebugSerial || MainSerial );
  #endif
}


void loop() {
  // Check connection
  int wasup= state!=state_noconsole;
  int isup= MainSerial;
  if( wasup!=isup ) {
    if( isup ) {
      DebugSerial_print0("Web connected");
      MainSerial_printstr("Welcome to WebUSB-I2C " VERSION NL);
      state= state_prompt;
    } else {
      DebugSerial_print0("Web disconnected");
      state= state_noconsole;
    }
  }
  // Get command char (except when previous char has not yet been executed)
  if( state!=state_noconsole && ch==-1 && MainSerial.available() ) {
    ch = MainSerial.read();
    if( ch=='\0' ) 
      ch=-1; // Don't know what to do with a 0
    else {
      DebugSerial_trace((char)ch); 
      #ifdef LEDPIN
      digitalWrite( LEDPIN, ! digitalRead(LEDPIN));
      #endif
    }
  }
  // Alive
  DebugSerial_dot();
  // State processing
  switch( state ) {
    case state_noconsole:
      // Skip
      break;
    case state_prompt: 
      MainSerial_printstr(NL ">");
      state= state_idle;
      break; // transition without reading a new char (keep old 'ch')
    case state_idle: 
      if( ch==-1 ) {
        // skip
      } else if( ch=='w' ) { 
        MainSerial_printchar('w');
        state= state_wait_wa1;
      } else if( ch=='r' ) { 
        MainSerial_printchar('r');
        state= state_wait_ra1; 
      } else if( ch=='h' ) { 
        DebugSerial_print0("Help");
        MainSerial_printchar('h');
        MainSerial_printstr(NL "(wAA(DD)*|rAACC)+p where A, D, C are hex nibbles for address, data, count");
        state= state_prompt; 
      } else if( ch=='v' ) { 
        DebugSerial_print0("Version");
        MainSerial_printchar('v');
        MainSerial_printstr(NL VERSION);
        state= state_prompt; 
      } else { 
        DebugSerial_print1("Error in idle (ch=",ch,")");
        MainSerial_printchar('X');
        state= state_prompt; 
      }
      ch= -1; // mark as processed
      break;
    case state_wait_wa1: 
      if( ch==-1 ) {
        // skip
      } else if( ishex(ch) ) { 
        MainSerial_printchar(ch);  
        addr= hex2dec(ch); 
        state= state_wait_wa2; 
      } else { 
        DebugSerial_print1("Error in wa1 (ch=",ch,")");
        MainSerial_printchar('A');
        state= state_prompt;
      }
      ch= -1; // mark as processed
      break;
    case state_wait_wa2:
      if( ch==-1 ) {
        // skip
      } else if( ishex(ch) ) { 
        MainSerial_printchar(ch); 
        addr= addr*16+hex2dec(ch); 
        state= state_wait_wd1; 
        Wire.beginTransmission(addr); // Returns nothing
        DebugSerial_print1("beginTransmission(",addr,")");
      } else { 
        DebugSerial_print1("Error in wa2 (ch=",ch,")");
        MainSerial_printchar('A');
        state= state_prompt;    
      }
      ch= -1; // mark as processed
      break;
    case state_wait_wd1: 
      if( ch==-1 ) {
        // skip
      } else if( ishex(ch) ) { 
        MainSerial_printchar(ch); 
        data= hex2dec(ch);
        state= state_wait_wd2;  
      } else if( ch=='w' || ch=='r' || ch=='p' ) { 
        state= state_wait_wx;
        break; // transition without reading a new char (keep old 'ch')
      } else { 
        DebugSerial_print1("Error in wd1 (ch=",ch,")");
        MainSerial_printchar('D');
        state= state_prompt;
      }
      ch= -1; // mark as processed
      break;
    case state_wait_wd2:
      if( ch==-1 ) {
        // skip
      } else if( ishex(ch) ) { 
        MainSerial_printchar(ch); 
        data= data*16+hex2dec(ch);
        state= state_wait_wd1;  
        Wire.write(data); // returns number of bytes written, ignored
        DebugSerial_print1("write(",data,")");
      } else { 
        DebugSerial_print1("Error in wd1 (ch=",ch,")");
        MainSerial_printchar('D');
        state= state_prompt;
      }
      ch= -1; // mark as processed
      break;
    case state_wait_wx: 
      if( ch==-1 ) {
        // skip
      } else if( ch=='w' ) {
        int result=Wire.endTransmission(false); 
        DebugSerial_print1("endTransmission(false) result=",result,""); 
        MainSerial_printchar('['); 
        MainSerial_printbyte(result);
        MainSerial_printchar(']'); 
        MainSerial_printchar('w');
        state= state_wait_wa1;
      } else if( ch=='r' ) {
        int result=Wire.endTransmission(false); 
        DebugSerial_print1("endTransmission(false) result=",result,""); 
        MainSerial_printchar('['); 
        MainSerial_printbyte(result);
        MainSerial_printchar(']'); 
        MainSerial_printchar('r'); 
        state= state_wait_ra1;
      } else if( ch=='p' ) {
        int result=Wire.endTransmission(true); 
        DebugSerial_print1("endTransmission(true) result=",result,""); 
        MainSerial_printchar('p'); 
        MainSerial_printchar('['); 
        MainSerial_printbyte(result);
        MainSerial_printchar(']'); 
        state= state_prompt;
      } // No other case possible, see 'case state_wait_wd1'
      ch= -1; // mark as processed
      break;
    case state_wait_ra1: 
      if( ch==-1 ) {
        // skip
      } else if( ishex(ch) ) { 
        MainSerial_printchar(ch);  
        addr= hex2dec(ch); 
        state= state_wait_ra2; 
      } else { 
        DebugSerial_print1("Error in ra1 (ch=",ch,")");
        MainSerial_printchar('A');
        state= state_prompt;
      }
      ch= -1; // mark as processed
      break;
    case state_wait_ra2: 
      if( ch==-1 ) {
        // skip
      } else if( ishex(ch) ) { 
        MainSerial_printchar(ch); 
        addr= addr*16+hex2dec(ch); 
        state= state_wait_rc1; 
      } else { 
        DebugSerial_print1("Error in ra2 (ch=",ch,")");
        MainSerial_printchar('A');
        state= state_prompt;    
      }
      ch= -1; // mark as processed
      break;
    case state_wait_rc1: 
      if( ch==-1 ) {
        // skip
      } else if( ishex(ch) ) { 
        MainSerial_printchar(ch); 
        count= hex2dec(ch);
        state= state_wait_rc2;  
      } else { 
        DebugSerial_print1("Error in wrc1 (ch=",ch,")");
        MainSerial_printchar('C');
        state= state_prompt;
      }
      ch= -1; // mark as processed
      break;
    case state_wait_rc2:
      if( ch==-1 ) {
        // skip
      } else if( ishex(ch) ) { 
        MainSerial_printchar(ch); 
        count= count*16+hex2dec(ch); 
        state= state_wait_rx; 
      } else { 
        DebugSerial_print1("Error in rc2 (ch=",ch,")");
        MainSerial_printchar('C');
        state= state_prompt;    
      }
      ch= -1; // mark as processed
      break;
    case state_wait_rx:
      if( ch==-1 ) {
        // skip
      } else if( ch=='w' ) {
        Wire.requestFrom(addr,count,false); // Returns number of bytes read - ignored, done by read loop
        DebugSerial_print2("requestFrom(",addr,",",count,",false)"); 
        MainSerial_printchar('['); 
        while( Wire.available() ) MainSerial_printbyte(Wire.read());
        MainSerial_printchar(']'); 
        MainSerial_printchar('w'); 
        state= state_wait_wa1;
      } else if( ch=='r' ) {
        Wire.requestFrom(addr,count,false); // Returns number of bytes read - ignored, done by read loop
        DebugSerial_print2("requestFrom(",addr,",",count,",false)"); 
        MainSerial_printchar('['); 
        while( Wire.available() ) MainSerial_printbyte(Wire.read());
        MainSerial_printchar(']'); 
        MainSerial_printchar('r'); 
        state= state_wait_ra1;
      } else if( ch=='p' ) {
        Wire.requestFrom(addr,count); // Returns number of bytes read - ignored, done by read loop
        DebugSerial_print2("requestFrom(",addr,",",count,",true)"); 
        MainSerial_printchar('p'); 
        MainSerial_printchar('['); 
        while( Wire.available() ) MainSerial_printbyte(Wire.read());
        MainSerial_printchar(']'); 
        state= state_prompt;
      } else { 
        DebugSerial_print1("Error in rx (ch=",ch,")");
        MainSerial_printchar('X');
        state= state_prompt;
      }
      ch= -1; // mark as processed
      break;
  }
}


