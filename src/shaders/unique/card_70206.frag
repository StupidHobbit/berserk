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

// Аль-Фаграз: dawn sounds a muster through the bridge and citadel;
// the formal garden sends up green healing lights beneath the white wall.
float glow(vec2 p, vec2 c, vec2 r) {
    vec2 d=(p-c)/r;
    return exp(-dot(d,d)*2.5);
}
float segment(vec2 p,vec2 a,vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 source=texture2D(u_card,v_uv);
    vec3 c=source.rgb;
    float aa=max(1.0/max(u_resolution.x,1.0),0.71/max(u_resolution.y,1.0));
    float seed=fract(u_seed*0.1731);
    float t=max(u_time,0.0);
    float clock=t+seed*4.0;
    float art=smoothstep(0.140,0.149,p.y)*(1.0-smoothstep(0.553,0.564,p.y));
    art*=smoothstep(0.008,0.018,p.x)*(1.0-smoothstep(0.982,0.992,p.x));
    // Title/cost and all three shields remain outside the animated plate.
    art*=smoothstep(0.076,0.086,length((p-vec2(0.108,0.080))*vec2(1.0,1.41)));
    art*=smoothstep(0.081,0.090,length((p-vec2(0.889,0.077))*vec2(1.0,1.41)));
    float lum=dot(source.rgb,vec3(0.2126,0.7152,0.0722));

    // Slow cloud banks cross the open sky. A conservative skyline keeps the
    // moving atmosphere behind the citadel rather than washing over its roofs.
    float skyline=0.252
        -0.106*exp(-pow((p.x-0.584)/0.062,2.0))
        -0.046*exp(-pow((p.x-0.478)/0.052,2.0))
        -0.040*exp(-pow((p.x-0.659)/0.048,2.0))
        -0.031*exp(-pow((p.x-0.397)/0.039,2.0));
    float openSky=1.0-smoothstep(skyline-0.018,skyline,p.y);
    float clouds=0.0;
    for(int i=0;i<4;i++) {
        float k=float(i);
        float x=fract(clock*0.055+k*0.25)*1.6-0.30;
        float y=0.166+0.027*mod(k,2.0);
        clouds+=glow(p,vec2(x,y),vec2(0.20,0.017));
        clouds+=glow(p,vec2(x-0.075,y+0.009),vec2(0.13,0.012))*0.55;
    }
    c=mix(c,vec3(0.95,0.83,0.79),clamp(clouds*openSky*0.35,0.0,0.42));

    // Salmon dawn behind the largest tower. The light is rooted at its roof,
    // with separately masked rays in the sky and warmth down the pale wall.
    vec2 sun=vec2(0.584,0.149);
    float sky=1.0-smoothstep(0.210,0.262,p.y);
    float tower=glow(p,vec2(0.584,0.208),vec2(0.080,0.124));
    float theta=atan((p.x-sun.x)*0.71,p.y-sun.y);
    float rays=pow(0.5+0.5*sin(theta*19.0+0.18*sin(clock*0.32)),7.0);
    float halo=glow(p,sun,vec2(0.40,0.16));
    c+=(1.0-c)*vec3(1.0,0.64,0.30)*halo*sky*(1.0-tower)
        *(0.15+0.21*rays)*(0.80+0.20*sin(clock*0.65));

    float wall=glow(p,vec2(0.525,0.370),vec2(0.185,0.147));
    wall*=smoothstep(0.30,0.65,lum);
    float muster=pow(0.5+0.5*sin(p.y*35.0-p.x*12.0+clock*1.25),3.0);
    c+=(1.0-c)*vec3(1.0,0.75,0.36)*wall*(0.10+0.30*muster);

    // The painted bridge's upper parapet carries the first-attack signal.
    float bridge=min(segment(p,vec2(0.309,0.483),vec2(0.431,0.521)),
                     segment(p,vec2(0.309,0.483),vec2(0.415,0.430)));
    float rail=(1.0-smoothstep(0.0018,0.0040+aa,bridge));
    float signal=pow(0.5+0.5*sin(p.x*41.0-p.y*74.0-clock*2.1),5.0);
    c+=(1.0-c)*vec3(1.0,0.80,0.36)*rail*(0.20+0.66*signal);
    c+=(1.0-c)*vec3(1.0,0.55,0.19)*exp(-bridge*bridge/0.00016)*0.10;
    // Two readable command pulses climb the bridge toward the gate, with
    // a short trailing glow. Unlike a fine glint these survive compact scaling.
    for(int i=0;i<2;i++) {
        float phase=fract(clock*0.28+float(i)*0.5);
        vec2 at=phase<0.46
            ? mix(vec2(0.431,0.521),vec2(0.309,0.483),phase/0.46)
            : mix(vec2(0.309,0.483),vec2(0.415,0.430),(phase-0.46)/0.54);
        float pulse=glow(p,at,vec2(0.016+aa,0.010+aa));
        float fringe=glow(p,at,vec2(0.034,0.024));
        c+=(1.0-c)*vec3(1.0,0.79,0.27)*(pulse*0.95+fringe*0.24);
    }

    // Narrow warm windows follow the central keep and its two side towers.
    float windows=0.0;
    for(int i=0;i<12;i++) {
        float k=float(i);
        float column=mod(k,3.0);
        float row=floor(k/3.0);
        vec2 at=vec2(0.565+column*0.015,0.198+row*0.018);
        windows+=glow(p,at,vec2(0.0033,0.0060))
                *(0.58+0.42*sin(clock*0.85-row*0.70+column*0.4));
    }
    windows+=glow(p,vec2(0.652,0.228),vec2(0.004,0.007));
    windows+=glow(p,vec2(0.496,0.239),vec2(0.0035,0.007));
    c+=(1.0-c)*vec3(1.0,0.75,0.28)*windows*0.85;

    // Mint healing shoots emerge from the four planted beds. Their bases
    // remain visible at time zero; the drifting tips never leave the garden.
    float garden=glow(p,vec2(0.654,0.515),vec2(0.145,0.068));
    float green=smoothstep(0.01,0.15,source.g-source.b);
    c+=(1.0-c)*vec3(0.47,1.0,0.60)*garden*green*(0.10+0.12*sin(clock*1.15));
    float seeds=0.0;
    float trail=0.0;
    for(int i=0;i<16;i++) {
        float k=float(i);
        float h=fract(sin(k*31.17+seed*9.0)*1731.79);
        float life=fract(clock*0.23+k/16.0);
        float x=0.561+0.177*h+0.009*sin(life*7.0+k);
        float y=0.539-0.095*life-0.018*h;
        vec2 d=(p-vec2(x,y))*vec2(1.0,1.41);
        float fade=sin(life*3.14159265);
        float r=0.0035+0.0020*h;
        seeds+=(1.0-smoothstep(r,r+aa,length(d)))*fade;
        trail+=glow(p,vec2(x,y+0.004),vec2(0.0055,0.023))*fade;
    }
    c+=(1.0-c)*vec3(0.57,1.0,0.71)*(seeds*1.0+trail*0.38);

    if(u_is_foil) {
        // Engraved metallic light follows the great diagonal curtain wall.
        // Broad persistent spectral bands remain legible on a small card.
        float phase=p.x*2.7+p.y*3.4+0.08*sin(p.y*32.0)-t*0.10+seed*0.25;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        vec3 metal=mix(vec3(0.92,0.67,0.38),spectrum,0.66);
        float polished=pow(0.5+0.5*sin(p.x*18.0+p.y*28.0-t*0.95),9.0);
        vec3 coated=mix(2.0*c*metal,1.0-2.0*(1.0-c)*(1.0-metal),step(vec3(0.5),c));
        c=mix(c,coated,0.48+0.15*wall);
        c+=(1.0-c)*mix(vec3(1.0,0.92,0.67),spectrum,0.38)
            *(0.09+0.43*polished)*(0.40+0.60*smoothstep(0.20,0.72,lum));
        float engraving=pow(0.5+0.5*sin(p.x*195.0+p.y*76.0),15.0);
        c+=(1.0-c)*metal*wall*engraving*0.17;
        c+=(1.0-c)*vec3(0.72,1.0,0.86)*garden*(0.08+0.18*polished);
    }
    gl_FragColor=vec4(mix(source.rgb,clamp(c,0.0,1.0),art),source.a);
}
