#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Хродгар: living tankard steam and two shared-strength currents across the
// tavern table echo his formation's redistribution of wounds to its allies.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.45,1.0,length((p-c)/r));
}
float ribbon(vec2 p, vec2 a, vec2 b, float head, float aa) {
    vec2 ab=(b-a)*vec2(1.0,1.4113);
    vec2 ap=(p-a)*vec2(1.0,1.4113);
    float q=clamp(dot(ap,ab)/max(dot(ab,ab),0.00001),0.0,1.0);
    float d=length(ap-ab*q);
    float tail=exp(-pow((q-head)/0.22,2.0));
    return (1.0-smoothstep(0.0015,0.0035+aa*0.65,d))*tail;
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.137);
    float art=smoothstep(0.142,0.154,p.y)*(1.0-smoothstep(0.540,0.557,p.y));
    art*=smoothstep(0.007,0.025,p.x)*(1.0-smoothstep(0.974,0.992,p.x));
    // Both left badges, their numbered circles and outer printed rims.
    art*=smoothstep(1.0,1.16,length((p-vec2(0.110,0.184))/vec2(0.066,0.043)));
    art*=smoothstep(1.0,1.16,length((p-vec2(0.149,0.207))/vec2(0.029,0.021)));
    art*=smoothstep(1.0,1.16,length((p-vec2(0.110,0.263))/vec2(0.066,0.043)));
    art*=smoothstep(1.0,1.16,length((p-vec2(0.149,0.286))/vec2(0.029,0.021)));
    vec3 color=scan.rgb;

    // Breathe life into the painted steam only: no face, hand or print moves.
    float steamArea=oval(p,vec2(0.652,0.289),vec2(0.122,0.069));
    vec2 drift=vec2(sin(p.y*103.0-t*2.4+seed*6.28),cos(p.x*89.0+t*1.8))*0.004;
    vec2 sampleP=p+drift*steamArea;
    vec3 stirred=texture2D(u_card,vec2(sampleP.x,1.0-sampleP.y)).rgb;
    color=mix(color,stirred,steamArea*0.85);

    // Broad, rolling curls escape the actual mouth of the tankard. Each puff
    // grows and fades before wrapping; at compact size the climb stays clear.
    float steam=0.0;
    for(int i=0;i<14;i++) {
        float k=float(i);
        float q=fract(t*0.235+k/14.0+seed*0.19);
        vec2 c=vec2(0.601+q*0.115+sin(q*11.0-t*0.75+k*0.18)*0.019,
                    0.335-q*0.102);
        vec2 r=vec2(0.015+q*0.016,0.009+q*0.010);
        float edge=length((p-c)/r);
        float puff=(1.0-smoothstep(0.16,1.0,edge));
        float fade=smoothstep(0.0,0.13,q)*(1.0-smoothstep(0.66,1.0,q));
        steam+=puff*fade*0.22;
    }
    float face=oval(p,vec2(0.444,0.285),vec2(0.109,0.096));
    color=mix(color,vec3(0.84,0.85,0.77),min(steam,0.68)*(1.0-face));

    // Shared pulses follow the two painted table edges away from the mug.
    // Their warm, copper streaks remain beneath the fists and cup silhouette.
    float phase=fract(t*0.34+seed);
    float fade=smoothstep(0.0,0.09,phase)*(1.0-smoothstep(0.81,1.0,phase));
    float relay=ribbon(p,vec2(0.677,0.502),vec2(0.958,0.465),phase,aa)
               +ribbon(p,vec2(0.628,0.508),vec2(0.356,0.539),phase,aa);
    color+=vec3(0.66,0.34,0.075)*relay*fade*0.70;
    // Tiny escaping amber droplets catch the light above the tankard rim.
    for(int i=0;i<4;i++) {
        float k=float(i);
        float q=fract(t*0.45+k*0.25+seed);
        vec2 c=vec2(0.605+k*0.021+sin(q*4.7+k)*0.012,0.338-q*0.057);
        float d=length((p-c)*vec2(1.0,1.4113));
        float f=sin(q*3.14159265);
        color+=vec3(0.56,0.34,0.09)*(1.0-smoothstep(0.001,0.003+aa*0.65,d))*f*0.6;
    }

    if(u_is_foil) {
        float luma=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
        // Cool tankard hoops and studded cuffs provide real metal landmarks.
        float hoops=oval(p,vec2(0.622,0.342),vec2(0.065,0.029))
                   +oval(p,vec2(0.658,0.448),vec2(0.066,0.034));
        float cuffs=oval(p,vec2(0.823,0.364),vec2(0.071,0.075))
                   +oval(p,vec2(0.215,0.478),vec2(0.143,0.051));
        float metal=clamp(hoops+cuffs*smoothstep(0.19,0.60,luma),0.0,1.0);
        float bands=p.x*2.4-p.y*3.4-t*0.17+seed*0.20;
        vec3 hue=0.5+0.5*cos(6.2831853*(bands+vec3(0.0,0.33,0.67)));
        vec3 overlay=mix(2.0*color*hue,1.0-2.0*(1.0-color)*(1.0-hue),step(vec3(0.5),color));
        // Static spatial colour separation identifies foil even at time zero.
        color=mix(color,overlay,0.29+metal*0.23);
        float gleam=pow(0.5+0.5*sin(bands*6.2831853+p.y*9.0),9.0);
        color+=(1.0-color)*mix(vec3(0.72,0.84,0.64),hue,0.58)*metal*(0.15+gleam*0.63);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
