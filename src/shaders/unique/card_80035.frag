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

// Матриарх Дегаска: the throne's sacrificial fires feed successive predatory
// powers into her hands and belt. Coordinates are top-left scan coordinates.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.65,1.0,length((p-c)/r));
}
float hash(float n) { return fract(sin(n*127.1+79.7)*43758.5453); }
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}
vec2 feedingPath(float f, float side) {
    vec2 source=mix(vec2(0.309,0.445),vec2(0.858,0.405),side);
    vec2 hand=mix(vec2(0.383,0.289),vec2(0.755,0.313),side);
    vec2 belt=vec2(0.580,0.334);
    return (1.0-f)*(1.0-f)*source+2.0*(1.0-f)*f*hand+f*f*belt;
}

void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=u_time;
    float seed=u_seed*0.127;
    float art=smoothstep(0.140,0.155,p.y)*(1.0-smoothstep(0.535,0.550,p.y));
    art*=smoothstep(0.009,0.025,p.x)*(1.0-smoothstep(0.975,0.991,p.x));
    // Shield, sword and the attached numeral are fully excluded.
    art*=clamp(smoothstep(0.183,0.207,p.x)+smoothstep(0.303,0.322,p.y),0.0,1.0);
    vec3 color=scan.rgb;
    float luma=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float figure=oval(p,vec2(0.597,0.339),vec2(0.220,0.236));
    float face=oval(p,vec2(0.634,0.179),vec2(0.069,0.055));

    // Lightning already painted in the sky throbs behind the seated silhouette.
    float sky=clamp(scan.b-scan.r,0.0,1.0)*(1.0-figure);
    float thunder=pow(0.5+0.5*sin(t*1.65+seed),14.0);
    float fork=pow(0.5+0.5*sin(t*4.4+0.6),8.0);
    color+=vec3(0.07,0.22,0.28)*sky*(0.15+0.65*thunder+0.20*fork);

    // The two real braziers flicker; their orange cores remain visible beneath
    // the crimson essence that climbs toward the matriarch's hands.
    float leftFire=oval(p,vec2(0.309,0.420),vec2(0.051,0.058));
    float rightFire=oval(p,vec2(0.857,0.382),vec2(0.064,0.083));
    float fire=clamp(leftFire+rightFire,0.0,1.0);
    float hot=smoothstep(0.08,0.30,scan.r-scan.b);
    float flicker=0.55+0.25*sin(t*7.7+p.y*103.0)+0.20*sin(t*12.1+p.x*71.0);
    color+=vec3(0.36,0.12,0.012)*fire*hot*flicker;
    color+=vec3(0.09,0.009,0.002)*fire*(0.55+0.45*sin(t*3.2));

    float essence=0.0;
    float sparks=0.0;
    for (int i=0;i<24;i++) {
        float fi=float(i);
        float side=step(11.5,fi);
        float age=fract(t*0.185+fi*0.08333+seed+side*0.29);
        vec2 center=feedingPath(age,side);
        center.x+=sin(age*12.0+t*1.8+fi)*0.008*sin(age*3.141593);
        float d=length((p-center)*vec2(1.0,0.71));
        float envelope=sin(age*3.141593);
        float radius=0.0018+hash(fi+3.0)*0.0018;
        essence+=exp(-d*d/0.00019)*envelope*0.11;
        sparks+=(1.0-smoothstep(radius,radius+aa,d))*envelope
                *radius/(radius+aa*0.35);
    }
    color+=vec3(0.36,0.016,0.035)*essence;
    color+=vec3(0.85,0.13,0.055)*sparks;

    // Each acquired power draws another fang on the dark red hanging cloth.
    // Curved, tapering fang edges converge into the actual belt jewel.
    float cycle=fract(t/8.0+seed);
    float fangs=0.0;
    float cloth=oval(p,vec2(0.580,0.431),vec2(0.114,0.115));
    for (int i=0;i<3;i++) {
        float fi=float(i);
        float reveal=smoothstep(fi*0.19,fi*0.19+0.14,cycle)
                    *(1.0-smoothstep(0.84,1.0,cycle));
        float fy=clamp((p.y-0.345)/0.160,0.0,1.0);
        float fangX=0.573+(fi-1.0)*0.032*(1.0-fy)
                    +sin(fy*3.141593)*(0.024+fi*0.008);
        float width=mix(0.0035,0.0005,fy);
        float edge=1.0-smoothstep(width,width+aa,abs(p.x-fangX));
        float ends=smoothstep(0.342,0.358,p.y)*(1.0-smoothstep(0.490,0.509,p.y));
        fangs+=edge*ends*(0.18+0.82*reveal)*(0.7+0.3*sin(t*3.0-fy*12.0));
    }
    color+=vec3(0.50,0.028,0.048)*fangs*cloth;
    float heartbeat=pow(0.5+0.5*sin(t*3.5+seed),5.0);
    float jewel=oval(p,vec2(0.579,0.331),vec2(0.017,0.018));
    color+=vec3(0.58,0.025,0.045)*jewel*(0.35+heartbeat*0.65);

    // Acquired strength reaches her drawn curved blade and armored fingers.
    float blade=1.0-smoothstep(0.003,0.010+aa,
                   segment(p,vec2(0.262,0.405),vec2(0.359,0.323)));
    float bladeSweep=exp(-pow((p.y-(0.325+fract(t*0.29+seed)*0.083))/0.017,2.0));
    color+=vec3(0.42,0.13,0.10)*blade*bladeSweep;
    float hands=oval(p,vec2(0.383,0.292),vec2(0.041,0.030))
               +oval(p,vec2(0.751,0.315),vec2(0.046,0.033));
    color+=vec3(0.13,0.018,0.006)*hands*heartbeat;

    if (u_is_foil) {
        // Hammered throne metal and armor catch a separate traveling spectrum.
        float metal=smoothstep(0.13,0.48,luma)
                   *(1.0-smoothstep(0.13,0.40,abs(scan.r-scan.b)));
        float armor=oval(p,vec2(0.720,0.256),vec2(0.086,0.081))
                   +oval(p,vec2(0.669,0.435),vec2(0.074,0.112));
        float phase=p.x*2.1-p.y*2.9+t*0.15+seed+0.09*sin(p.y*34.0-t);
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        vec3 coated=mix(2.0*color*spectrum,
                       1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,coated,(0.13+metal*0.28)*(1.0-face*0.95));
        float sheen=pow(0.5+0.5*sin(p.x*12.0+p.y*8.0-t*1.3),16.0);
        color+=(1.0-color)*mix(vec3(0.83,0.71,0.47),spectrum,0.44)
               *sheen*metal*(0.14+0.19*armor)*(1.0-face);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
